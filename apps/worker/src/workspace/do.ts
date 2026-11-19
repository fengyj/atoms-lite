import { DurableObject } from "cloudflare:workers";
import { Files } from "@cloudflare/sandbox";
import {
  BUILD_TIMEOUT_MS,
  EXEC_MAX_OUTPUT_BYTES,
  EXEC_TIMEOUT_MS,
  SANDBOX_INACTIVITY_TIMEOUT_MS,
} from "@atoms-lite/contracts";
import type { Env } from "../env";
import { BROWSER_STATIC_FILES } from "../browser-template";
import {
  normalizeRuntime,
  normalizeTemplate,
  runtimeForTemplate,
  type RuntimeKind,
  type TemplateId,
} from "../templates";
import type { ExecResult, FileEntry, VersionRow } from "./client";

const PREVIEW_PORT = 8080;
const WORKSPACE = "/workspace";
const MIGRATION_DIR = "_sandbox_migration";
const MIGRATION_MAX_BYTES = 30 * 1024 * 1024;
const MIGRATION_MAX_FILE_BYTES = 2 * 1024 * 1024;
const MIGRATION_MAX_FILES = 500;

// boot.sh 是新镜像的 supervisor；旧快照没有该文件时回退到静态服务器。
const ENTRYPOINT = [
  "sh",
  "-c",
  "if [ -f /opt/preview/boot.sh ]; then exec sh /opt/preview/boot.sh; else exec node /opt/preview/server.mjs; fi",
];

type InstanceTier = "basic" | "standard-1" | "standard-2";
const INSTANCE_TIERS: InstanceTier[] = ["basic", "standard-1", "standard-2"];

function nextInstanceTier(current: InstanceTier): InstanceTier | null {
  const index = INSTANCE_TIERS.indexOf(current);
  return index >= 0 ? (INSTANCE_TIERS[index + 1] ?? null) : null;
}
const ALLOWED_PROGRAMS = new Set([
  "ls",
  "cat",
  "grep",
  "git",
  "wc",
  "head",
  "tail",
  "mkdir",
  "cp",
  "mv",
  "test",
]);

const dec = (b?: ArrayBuffer | null) =>
  new TextDecoder().decode(b ?? new ArrayBuffer(0));

/** 平台内部目录：不暴露给文件浏览、Agent 工具与预览。 */
const INTERNAL_DIRS = [
  ".git",
  ".atoms",
  ".atoms-lite",
  MIGRATION_DIR,
] as const;

function isInternalPath(path: string): boolean {
  const padded = `/${path.replace(/^\/+/, "")}/`;
  return INTERNAL_DIRS.some((dir) => padded.includes(`/${dir}/`));
}

function capacityRank(runtime: RuntimeKind, tier: string): number {
  if (runtime === "browser") return 0;
  if (tier === "standard-2") return 3;
  if (tier === "standard-1") return 2;
  return 1;
}

function isTextPath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (/^\.(gitignore|npmrc|editorconfig|prettierrc|eslintrc)$/.test(name)) {
    return true;
  }
  return /\.(md|txt|json|ya?ml|html?|css|scss|less|js|jsx|ts|tsx|mjs|cjs|vue|svelte|svg|xml|csv|sql|sh|toml|env)$/i.test(
    path,
  );
}

function isRestorableDependency(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  return (
    name === "pnpm-lock.yaml" ||
    name === "package-lock.json" ||
    name === "yarn.lock" ||
    name === ".npmrc"
  );
}

function safePath(path: string): string {
  if (
    !path.startsWith(`${WORKSPACE}/`) ||
    path.includes("..") ||
    isInternalPath(path)
  ) {
    throw new Error(`path not allowed: ${path}`);
  }
  return path;
}

function safeCwd(cwd: string | undefined): string {
  if (!cwd) return WORKSPACE;
  if (cwd === WORKSPACE) return cwd;
  if (cwd.startsWith(`${WORKSPACE}/`) && !cwd.includes("..")) return cwd;
  return WORKSPACE;
}

type RuntimeConfig = {
  kind?: string;
  serveDir?: string;
  buildCommand?: string | null;
  startCommand?: string | null;
  port?: number;
};

const PACKAGE_SPEC_RE =
  /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[A-Za-z0-9.^~+_-]+)?$/;

function parsePackageSpec(raw: string): {
  name: string;
  version: string;
  spec: string;
} {
  const spec = raw.trim();
  if (!PACKAGE_SPEC_RE.test(spec)) {
    throw new Error(`invalid package spec: ${raw}`);
  }
  const at = spec.lastIndexOf("@");
  if (at > 0) {
    return {
      name: spec.slice(0, at),
      version: spec.slice(at + 1) || "latest",
      spec,
    };
  }
  return { name: spec, version: "latest", spec };
}

type VersionDbRow = {
  id: string;
  git_commit: string;
  parent_id: string | null;
  summary: string;
  status: string;
  archived: number;
  created_at: number;
};

export class Workspace extends DurableObject<Env> {
  private readonly projectId: string;
  private ensurePromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 每个项目一个 DO（idFromName(projectId)），同时也拥有自己的容器。
    this.projectId = ctx.id.name ?? "demo";
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_versions (
        id TEXT PRIMARY KEY,
        git_commit TEXT NOT NULL,
        parent_id TEXT,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_snapshots (
        project_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_workspace (
        id TEXT PRIMARY KEY,
        current_version_id TEXT
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_files (
        path TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_project_config (
        id TEXT PRIMARY KEY,
        template TEXT NOT NULL,
        runtime TEXT NOT NULL DEFAULT 'container',
        instance_tier TEXT NOT NULL DEFAULT 'basic',
        configured INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_file_content (
        path TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_file_versions (
        version_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY (version_id, path)
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_dependencies (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        url TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_runtime_status (
        id TEXT PRIMARY KEY,
        snapshot_error TEXT,
        snapshot_at INTEGER
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_migration (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source_template TEXT NOT NULL,
        source_runtime TEXT NOT NULL,
        source_instance TEXT NOT NULL,
        target_template TEXT NOT NULL,
        target_runtime TEXT NOT NULL,
        target_instance TEXT NOT NULL,
        snapshot_id TEXT,
        archive_files INTEGER NOT NULL DEFAULT 0,
        archive_bytes INTEGER NOT NULL DEFAULT 0,
        skipped TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_migration_files (
        path TEXT PRIMARY KEY,
        content BLOB NOT NULL,
        size INTEGER NOT NULL,
        kind TEXT NOT NULL
      )
    `);
    for (const statement of [
      "ALTER TABLE atoms_project_config ADD COLUMN runtime TEXT NOT NULL DEFAULT 'container'",
      "ALTER TABLE atoms_project_config ADD COLUMN instance_tier TEXT NOT NULL DEFAULT 'basic'",
      "ALTER TABLE atoms_project_config ADD COLUMN configured INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE atoms_versions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    ]) {
      try {
        ctx.storage.sql.exec(statement);
      } catch {
        // 已存在
      }
    }
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO atoms_runtime_status (id, snapshot_error, snapshot_at) VALUES (?, NULL, NULL)",
      this.projectId,
    );
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO atoms_workspace (id, current_version_id) VALUES (?, NULL)",
      this.projectId,
    );
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO atoms_project_config (id, template, runtime, instance_tier, updated_at) VALUES (?, 'static', 'container', 'basic', 0)",
      this.projectId,
    );
  }

  /** 热部署后旧 DO 实例不会重跑 constructor；每次 fetch 做幂等迁移。 */
  private ensureSchema(): void {
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_versions (
      id TEXT PRIMARY KEY, git_commit TEXT NOT NULL, parent_id TEXT,
      summary TEXT NOT NULL, status TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_snapshots (
      project_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, created_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_workspace (
      id TEXT PRIMARY KEY, current_version_id TEXT
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_files (
      path TEXT PRIMARY KEY, size INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_project_config (
      id TEXT PRIMARY KEY, template TEXT NOT NULL, runtime TEXT NOT NULL DEFAULT 'container',
      instance_tier TEXT NOT NULL DEFAULT 'basic', configured INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_file_content (
      path TEXT PRIMARY KEY, content TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_file_versions (
      version_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL,
      PRIMARY KEY (version_id, path)
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_dependencies (
      name TEXT PRIMARY KEY, version TEXT NOT NULL, url TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_runtime_status (
      id TEXT PRIMARY KEY, snapshot_error TEXT, snapshot_at INTEGER
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_migration (
      id TEXT PRIMARY KEY, status TEXT NOT NULL, source_template TEXT NOT NULL,
      source_runtime TEXT NOT NULL, source_instance TEXT NOT NULL,
      target_template TEXT NOT NULL, target_runtime TEXT NOT NULL,
      target_instance TEXT NOT NULL, snapshot_id TEXT,
      archive_files INTEGER NOT NULL DEFAULT 0, archive_bytes INTEGER NOT NULL DEFAULT 0,
      skipped TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS atoms_migration_files (
      path TEXT PRIMARY KEY, content BLOB NOT NULL, size INTEGER NOT NULL,
      kind TEXT NOT NULL
    )`);

    for (const statement of [
      "ALTER TABLE atoms_project_config ADD COLUMN runtime TEXT NOT NULL DEFAULT 'container'",
      "ALTER TABLE atoms_project_config ADD COLUMN instance_tier TEXT NOT NULL DEFAULT 'basic'",
      "ALTER TABLE atoms_project_config ADD COLUMN configured INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE atoms_versions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    ]) {
      try {
        sql.exec(statement);
      } catch {
        // 已存在
      }
    }
    sql.exec(
      "INSERT OR IGNORE INTO atoms_workspace (id, current_version_id) VALUES (?, NULL)",
      this.projectId,
    );
    sql.exec(
      "INSERT OR IGNORE INTO atoms_project_config (id, template, runtime, updated_at) VALUES (?, 'static', 'container', 0)",
      this.projectId,
    );
    sql.exec(
      "INSERT OR IGNORE INTO atoms_runtime_status (id, snapshot_error, snapshot_at) VALUES (?, NULL, NULL)",
      this.projectId,
    );
  }

  private get container(): Container {
    const container = this.ctx.container;
    if (!container) throw new Error("container binding is not configured");
    return container;
  }

  /** 串行化版本/checkout，避免 .git/index.lock 竞态。 */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  private async run(
    cmd: string[],
    cwd = WORKSPACE,
    timeoutMs = EXEC_TIMEOUT_MS,
    env?: Record<string, string>,
  ): Promise<ExecResult> {
    const proc = await this.container.exec(cmd, { cwd, env });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        proc.kill(9);
        reject(new Error(`command timeout: ${cmd.join(" ").slice(0, 80)}`));
      }, timeoutMs);
    });

    try {
      const out = await Promise.race([proc.output(), timeout]);
      return {
        stdout: dec(out.stdout),
        stderr: dec(out.stderr),
        exitCode: out.exitCode,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async sh(script: string, timeoutMs = EXEC_TIMEOUT_MS): Promise<ExecResult> {
    return this.run(["sh", "-c", script], WORKSPACE, timeoutMs);
  }

  private template(): TemplateId {
    const rows = this.ctx.storage.sql
      .exec<{ template: string }>(
        "SELECT template FROM atoms_project_config WHERE id = ?",
        this.projectId,
      )
      .toArray();
    return normalizeTemplate(rows[0]?.template);
  }

  private runtime(): RuntimeKind {
    const rows = this.ctx.storage.sql
      .exec<{ runtime: string }>(
        "SELECT runtime FROM atoms_project_config WHERE id = ?",
        this.projectId,
      )
      .toArray();
    return normalizeRuntime(rows[0]?.runtime);
  }

  private configured(): boolean {
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(atoms_project_config)")
      .toArray();
    if (!columns.some((column) => column.name === "configured")) return true;
    const rows = this.ctx.storage.sql
      .exec<{ configured: number }>(
        "SELECT configured FROM atoms_project_config WHERE id = ?",
        this.projectId,
      )
      .toArray();
    return rows[0]?.configured !== 0;
  }

  private instanceTier(): InstanceTier {
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(atoms_project_config)")
      .toArray();
    if (!columns.some((column) => column.name === "instance_tier")) {
      // 旧 DO 实例可能还没有该列；按默认 basic 运行，升级时再补列。
      return "basic";
    }
    const rows = this.ctx.storage.sql
      .exec<{ instance_tier: string }>(
        "SELECT instance_tier FROM atoms_project_config WHERE id = ?",
        this.projectId,
      )
      .toArray();
    const value = rows[0]?.instance_tier;
    return value === "standard-1" || value === "standard-2"
      ? value
      : "basic";
  }

  private setInstanceTier(tier: InstanceTier): void {
    try {
      this.ctx.storage.sql.exec(
        "ALTER TABLE atoms_project_config ADD COLUMN instance_tier TEXT NOT NULL DEFAULT 'basic'",
      );
    } catch {
      // 已存在
    }
    this.ctx.storage.sql.exec(
      "UPDATE atoms_project_config SET instance_tier = ?, updated_at = ? WHERE id = ?",
      tier,
      Date.now(),
      this.projectId,
    );
  }

  private setConfig(
    template: TemplateId,
    runtime: RuntimeKind,
    configured = true,
  ): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_project_config (id, template, runtime, configured, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET template = excluded.template,
         runtime = excluded.runtime, configured = excluded.configured,
         updated_at = excluded.updated_at`,
      this.projectId,
      template,
      runtime,
      configured ? 1 : 0,
      Date.now(),
    );
  }

  private async runtimeConfig(): Promise<RuntimeConfig> {
    // `.atoms-lite/` 是新路径；`.atoms/` 仅用于兼容旧快照。
    for (const dir of [".atoms-lite", ".atoms"]) {
      const out = await this.run([
        "cat",
        `${WORKSPACE}/${dir}/runtime.json`,
      ]);
      if (out.exitCode !== 0) continue;
      try {
        return JSON.parse(out.stdout) as RuntimeConfig;
      } catch {
        // 文件损坏时继续尝试旧路径，最终回退到静态根目录。
      }
    }
    return { kind: "static", serveDir: ".", buildCommand: null };
  }

  /**
   * 选择运行配置所在目录并发重启信号。
   * 旧工作区继续用 `.atoms/`，新工作区用 `.atoms-lite/`，
   * 避免在旧项目里创建未被其 .gitignore 覆盖的新目录。
   */
  private async signalPreviewRestart(): Promise<void> {
    const newer = await this.run([
      "test",
      "-f",
      `${WORKSPACE}/.atoms-lite/runtime.json`,
    ]);
    let dir = ".atoms-lite";
    if (newer.exitCode !== 0) {
      const older = await this.run([
        "test",
        "-f",
        `${WORKSPACE}/.atoms/runtime.json`,
      ]);
      if (older.exitCode === 0) dir = ".atoms";
    }
    await this.sh(`mkdir -p ${WORKSPACE}/${dir} && touch ${WORKSPACE}/${dir}/restart`);
  }

  private cachedFiles(): FileEntry[] {
    return this.ctx.storage.sql
      .exec<{ path: string; size: number }>(
        "SELECT path, size FROM atoms_files ORDER BY path",
      )
      .toArray()
      .filter((row) => !isInternalPath(row.path))
      .map((row) => ({ path: row.path, type: "file" as const, size: row.size }));
  }

  private filesCachedAt(): number {
    return (
      this.ctx.storage.sql
        .exec<{ ts: number | null }>("SELECT MAX(updated_at) AS ts FROM atoms_files")
        .one().ts ?? 0
    );
  }

  private upsertFilesCache(path: string, size: number): void {
    const rel = path.startsWith(`${WORKSPACE}/`)
      ? path.slice(WORKSPACE.length + 1)
      : path;
    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_files (path, size, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET size = excluded.size, updated_at = excluded.updated_at`,
      rel,
      size,
      Date.now(),
    );
  }

  private writeFilesCache(entries: FileEntry[]): number {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM atoms_files");
      for (const entry of entries) {
        this.ctx.storage.sql.exec(
          "INSERT INTO atoms_files (path, size, updated_at) VALUES (?, ?, ?)",
          entry.path,
          entry.size ?? 0,
          now,
        );
      }
    });
    return now;
  }

  /** 容器在运行时读取真实文件树，并写入 SQL 缓存。 */
  private async syncFilesCache(): Promise<FileEntry[]> {
    const entries = await this.handleFiles();
    this.writeFilesCache(entries);
    return entries;
  }

  /** 缓存失败不影响主流程（写文件、exec、版本操作）。 */
  private async syncFilesCacheSafe(): Promise<void> {
    if (this.runtime() === "browser") return;
    try {
      await this.syncFilesCache();
    } catch (error) {
      console.error("[workspace] file cache sync failed", error);
    }
  }

  private browserFiles(): FileEntry[] {
    return this.ctx.storage.sql
      .exec<{ path: string; size: number }>(
        "SELECT path, length(CAST(content AS BLOB)) AS size FROM atoms_file_content ORDER BY path",
      )
      .toArray()
      .filter((row) => !isInternalPath(row.path))
      .map((row) => ({ path: row.path, type: "file" as const, size: row.size }));
  }

  private browserFileRows(): { path: string; content: string }[] {
    return this.ctx.storage.sql
      .exec<{ path: string; content: string }>(
        "SELECT path, content FROM atoms_file_content ORDER BY path",
      )
      .toArray();
  }

  private browserContent(path: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ content: string }>(
        "SELECT content FROM atoms_file_content WHERE path = ?",
        path,
      )
      .toArray();
    return rows[0]?.content ?? null;
  }

  private browserWrite(path: string, content: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_file_content (path, content, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      path,
      content,
      Date.now(),
    );
  }

  private browserCachedAt(): number {
    return (
      this.ctx.storage.sql
        .exec<{ ts: number | null }>(
          "SELECT MAX(updated_at) AS ts FROM atoms_file_content",
        )
        .one().ts ?? 0
    );
  }

  private relativePath(path: string): string {
    if (!path.startsWith(`${WORKSPACE}/`)) {
      throw new Error(`path not allowed: ${path}`);
    }
    const rel = path.slice(WORKSPACE.length + 1);
    if (!rel || rel.includes("..") || isInternalPath(rel)) {
      throw new Error(`path not allowed: ${path}`);
    }
    return rel;
  }

  private async seedBrowser(): Promise<void> {
    const count = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM atoms_file_content")
      .one().n;
    if (count > 0) return;

    this.ctx.storage.transactionSync(() => {
      for (const [path, content] of Object.entries(BROWSER_STATIC_FILES)) {
        this.ctx.storage.sql.exec(
          "INSERT INTO atoms_file_content (path, content, updated_at) VALUES (?, ?, ?)",
          path,
          content,
          Date.now(),
        );
      }
    });
  }

  private async hashBrowserFiles(
    files: { path: string; content: string }[],
  ): Promise<string> {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const text = sorted.map((f) => `${f.path}\0${f.content}`).join("\0");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private async createBrowserVersion(summary: string) {
    return this.exclusive(async () => {
      await this.ensure();
      const files = this.browserFileRows();
      const hash = await this.hashBrowserFiles(files);
      const current = this.latestVersion();

      if (current?.gitCommit === hash) {
        return {
          versionId: current.id,
          gitCommit: hash,
          skipped: true,
          snapshotOk: true,
        };
      }

      const id = `ver_${crypto.randomUUID()}`;
      const now = Date.now();
      this.ctx.storage.sql.exec(
        "INSERT INTO atoms_versions (id, git_commit, parent_id, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        hash,
        current?.id ?? null,
        summary,
        "draft",
        now,
      );
      this.ctx.storage.transactionSync(() => {
        for (const file of files) {
          this.ctx.storage.sql.exec(
            "INSERT INTO atoms_file_versions (version_id, path, content) VALUES (?, ?, ?)",
            id,
            file.path,
            file.content,
          );
        }
      });
      this.setCurrentVersion(id);
      return {
        versionId: id,
        gitCommit: hash,
        skipped: false,
        snapshotOk: true,
      };
    });
  }

  private async checkoutBrowser(versionId: string) {
    return this.exclusive(async () => {
      await this.ensure();
      const rows = this.ctx.storage.sql
        .exec<{ git_commit: string }>(
          "SELECT git_commit FROM atoms_versions WHERE id = ?",
          versionId,
        )
        .toArray();
      const target = rows[0];
      if (!target) throw new Error(`version not found: ${versionId}`);

      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("DELETE FROM atoms_file_content");
        this.ctx.storage.sql.exec(
          `INSERT INTO atoms_file_content (path, content, updated_at)
           SELECT path, content, ? FROM atoms_file_versions WHERE version_id = ?`,
          Date.now(),
          versionId,
        );
      });
      this.setCurrentVersion(versionId);
      return { ok: true, gitCommit: target.git_commit, snapshotOk: true };
    });
  }

  private async serveBrowserFile(rest: string): Promise<Response> {
    let decoded = rest;
    try {
      decoded = decodeURIComponent(rest);
    } catch {
      return new Response("bad path", { status: 400 });
    }
    if (isInternalPath(decoded)) {
      return new Response("not found", { status: 404 });
    }

    let rel = decoded.replace(/^\/+/, "");
    let content = this.browserContent(rel);
    if (content === null) {
      // SPA 回退：无扩展名路径回退到 index.html
      if (!/\.[a-z0-9]+$/i.test(rel) || rel === "") {
        rel = "index.html";
        content = this.browserContent(rel);
      }
    }
    if (content === null) {
      return new Response("not found", { status: 404 });
    }

    if (rel === "index.html" && !/type=["']importmap["']/i.test(content)) {
      const deps = this.ctx.storage.sql
        .exec<{ name: string; url: string }>(
          "SELECT name, url FROM atoms_dependencies ORDER BY name",
        )
        .toArray();
      if (deps.length > 0) {
        const imports = Object.fromEntries(deps.map((d) => [d.name, d.url]));
        const tag = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
        content = /<head([^>]*)>/i.test(content)
          ? content.replace(/<head([^>]*)>/i, `<head$1>${tag}`)
          : `${tag}${content}`;
      }
    }

    const MIME: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "text/javascript; charset=utf-8",
      mjs: "text/javascript; charset=utf-8",
      json: "application/json; charset=utf-8",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      txt: "text/plain; charset=utf-8",
      md: "text/plain; charset=utf-8",
    };
    const ext = rel.includes(".") ? rel.split(".").pop()!.toLowerCase() : "";
    return new Response(content, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  private snapshotId(): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ snapshot_id: string }>(
        "SELECT snapshot_id FROM atoms_snapshots WHERE project_id = ?",
        this.projectId,
      )
      .toArray();
    return rows[0]?.snapshot_id ?? null;
  }

  private versionCount(): number {
    return this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM atoms_versions")
      .one().n;
  }

  private currentVersionId(): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ current_version_id: string | null }>(
        "SELECT current_version_id FROM atoms_workspace WHERE id = ?",
        this.projectId,
      )
      .toArray();
    return rows[0]?.current_version_id ?? null;
  }

  private setCurrentVersion(id: string | null): void {
    this.ctx.storage.sql.exec(
      "UPDATE atoms_workspace SET current_version_id = ? WHERE id = ?",
      id,
      this.projectId,
    );
  }

  private async waitRunning(deadlineMs = 60_000): Promise<void> {
    const deadline = Date.now() + deadlineMs;
    while (!this.container.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!this.container.running) throw new Error("container did not start");
  }

  private migrationRow(): {
    status: string;
    source_template: string;
    source_runtime: string;
    source_instance: string;
    target_template: string;
    target_runtime: string;
    target_instance: string;
    snapshot_id: string | null;
    archive_files: number;
    archive_bytes: number;
    skipped: string;
    created_at: number;
  } | null {
    const rows = this.ctx.storage.sql
      .exec<{
        status: string;
        source_template: string;
        source_runtime: string;
        source_instance: string;
        target_template: string;
        target_runtime: string;
        target_instance: string;
        snapshot_id: string | null;
        archive_files: number;
        archive_bytes: number;
        skipped: string;
        created_at: number;
      }>("SELECT * FROM atoms_migration WHERE id = ?", this.projectId)
      .toArray();
    return rows[0] ?? null;
  }

  private migrationInfo() {
    const row = this.migrationRow();
    if (!row || row.status !== "active") return null;
    return {
      active: true,
      sourceTemplate: row.source_template,
      sourceRuntime: row.source_runtime,
      targetTemplate: row.target_template,
      targetRuntime: row.target_runtime,
      files: row.archive_files,
      bytes: row.archive_bytes,
    };
  }

  private migrationManifest() {
    const migration = this.migrationRow();
    const files = this.migrationFiles();
    return {
      sourceTemplate: migration?.source_template ?? "",
      sourceRuntime: migration?.source_runtime ?? "",
      targetTemplate: migration?.target_template ?? "",
      targetRuntime: migration?.target_runtime ?? "",
      createdAt: migration?.created_at ?? Date.now(),
      files: files.map((row) => ({
        path: row.path,
        size: row.size,
        kind: row.kind,
      })),
      excluded: [
        "node_modules",
        "dist",
        ".git",
        ".atoms-lite",
        ".atoms",
        "lockfiles",
        "build caches",
      ],
      skipped: JSON.parse(migration?.skipped ?? "[]") as string[],
    };
  }

  private async exportWorkspaceArchive(): Promise<{
    files: number;
    bytes: number;
    skipped: string[];
  }> {
    this.ctx.storage.sql.exec("DELETE FROM atoms_migration_files");
    const skipped: string[] = [];
    let files = 0;
    let bytes = 0;

    const insert = (
      path: string,
      content: ArrayBuffer,
      kind: "text" | "binary",
    ) => {
      if (content.byteLength > MIGRATION_MAX_FILE_BYTES) {
        skipped.push(`${path} (${content.byteLength} bytes)`);
        return;
      }
      if (bytes + content.byteLength > MIGRATION_MAX_BYTES) {
        skipped.push(`${path} (total limit)`);
        return;
      }
      if (files >= MIGRATION_MAX_FILES) {
        skipped.push(`${path} (file limit)`);
        return;
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO atoms_migration_files (path, content, size, kind) VALUES (?, ?, ?, ?)",
        path,
        content,
        content.byteLength,
        kind,
      );
      files += 1;
      bytes += content.byteLength;
    };

    if (this.runtime() === "browser") {
      const rows = this.ctx.storage.sql
        .exec<{ path: string; content: string }>(
          "SELECT path, content FROM atoms_file_content ORDER BY path",
        )
        .toArray();
      const encoder = new TextEncoder();
      for (const row of rows) {
        if (isRestorableDependency(row.path)) continue;
        const encoded = encoder.encode(row.content);
        insert(row.path, encoded.buffer as ArrayBuffer, "text");
      }
      return { files, bytes, skipped };
    }

    await this.ensure();
    const listed = await this.run([
      "find",
      WORKSPACE,
      "-type",
      "f",
      "-not",
      "-path",
      "*/.git/*",
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*/dist/*",
      "-not",
      "-path",
      "*/.next/*",
      "-not",
      "-path",
      "*/.cache/*",
      "-not",
      "-path",
      "*/coverage/*",
      "-not",
      "-path",
      `*/${MIGRATION_DIR}/*`,
      "-not",
      "-path",
      "*/.atoms-lite/*",
      "-not",
      "-path",
      "*/.atoms/*",
    ]);
    const all = listed.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`${WORKSPACE}/`));
    const sandbox = new Files(this.container);
    for (const absolute of all) {
      const rel = absolute.slice(WORKSPACE.length + 1);
      if (isInternalPath(rel) || isRestorableDependency(rel)) continue;
      if (files >= MIGRATION_MAX_FILES || bytes >= MIGRATION_MAX_BYTES) {
        skipped.push(`${rel} (limit)`);
        continue;
      }
      try {
        const res = await sandbox.readFile(absolute);
        insert(
          rel,
          await res.arrayBuffer(),
          isTextPath(rel) ? "text" : "binary",
        );
      } catch {
        skipped.push(`${rel} (read failed)`);
      }
    }
    return { files, bytes, skipped };
  }

  private async writeMigrationArchiveToWorkspace(): Promise<void> {
    const rows = this.ctx.storage.sql
      .exec<{ path: string; content: ArrayBuffer; size: number; kind: string }>(
        "SELECT path, content, size, kind FROM atoms_migration_files ORDER BY path",
      )
      .toArray();
    if (rows.length === 0) return;
    const sandbox = new Files(this.container);
    const dirs = new Set<string>();
    for (const row of rows) {
      const target = `${WORKSPACE}/${MIGRATION_DIR}/files/${row.path}`;
      const dir = target.slice(0, target.lastIndexOf("/"));
      if (!dirs.has(dir)) {
        dirs.add(dir);
        await this.run(["mkdir", "-p", dir]);
      }
      await sandbox.writeFile(target, new Uint8Array(row.content));
    }

    const manifest = this.migrationManifest();
    await this.run(["mkdir", "-p", `${WORKSPACE}/${MIGRATION_DIR}`]);
    await sandbox.writeFile(
      `${WORKSPACE}/${MIGRATION_DIR}/manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
    await this.sh(
      `cd ${WORKSPACE}/${MIGRATION_DIR} && tar -czf workspace.tar.gz -C files .`,
    ).catch(() => undefined);
  }

  private async ensureMigrationIgnored(): Promise<void> {
    const line = `${MIGRATION_DIR}/`;
    await this.sh(
      `cd ${WORKSPACE} && (grep -qxF '${line}' .gitignore 2>/dev/null || printf '\n${line}\n' >> .gitignore)`,
    );
    await this.run(["mkdir", "-p", `${WORKSPACE}/.git/info`]);
    await this.sh(
      `cd ${WORKSPACE} && (grep -qxF '${line}' .git/info/exclude 2>/dev/null || printf '\n${line}\n' >> .git/info/exclude)`,
    );
  }

  private async resetToTemplate(template: TemplateId): Promise<void> {
    await this.sh(
      `cd ${WORKSPACE} && find . -mindepth 1 -maxdepth 1 -exec rm -rf {} +`,
    );
    await this.seed(template);
  }

  private migrationFiles(prefix = "") {
    const rows = this.ctx.storage.sql
      .exec<{ path: string; size: number; kind: string }>(
        "SELECT path, size, kind FROM atoms_migration_files ORDER BY path",
      )
      .toArray();
    return rows.filter((row) => !prefix || row.path.startsWith(prefix));
  }

  private migrationContent(path: string): {
    path: string;
    content: ArrayBuffer;
    kind: string;
  } {
    const cleaned = path
      .replace(/^\/+/, "")
      .replace(/^workspace\//, "")
      .replace(new RegExp(`^${MIGRATION_DIR}/`), "")
      .replace(/^files\//, "");
    if (!cleaned || cleaned.includes("..")) {
      throw new Error(`invalid migration path: ${path}`);
    }
    const rows = this.ctx.storage.sql
      .exec<{ path: string; content: ArrayBuffer; kind: string }>(
        "SELECT path, content, kind FROM atoms_migration_files WHERE path = ?",
        cleaned,
      )
      .toArray();
    const row = rows[0];
    if (!row) throw new Error(`migration file not found: ${cleaned}`);
    return row;
  }

  private async readMigrationFile(
    path: string,
    offset = 0,
    limit = 400,
  ): Promise<{
    path: string;
    content: string;
    truncated: boolean;
    kind: string;
  }> {
    const cleanedManifest = path
      .replace(/^\/+/, "")
      .replace(/^workspace\//, "")
      .replace(new RegExp(`^${MIGRATION_DIR}/`), "")
      .replace(/^files\//, "");
    if (cleanedManifest === "manifest.json") {
      return {
        path: "manifest.json",
        content: JSON.stringify(this.migrationManifest(), null, 2),
        truncated: false,
        kind: "text",
      };
    }
    const row = this.migrationContent(path);
    if (row.kind !== "text") {
      throw new Error(
        "this is a binary file; use copy_migration_file instead of reading it",
      );
    }
    const text = new TextDecoder().decode(row.content);
    const lines = text.split("\n");
    const start = Math.max(0, offset);
    const end = start + Math.max(1, Math.min(limit, 2000));
    return {
      path: row.path,
      content: lines.slice(start, end).join("\n"),
      truncated: end < lines.length,
      kind: row.kind,
    };
  }

  private async copyMigrationFile(from: string, to: string): Promise<{
    ok: true;
    from: string;
    to: string;
    bytes: number;
  }> {
    const row = this.migrationContent(from);
    const target = to.startsWith("/") ? to : `${WORKSPACE}/${to}`;
    if (this.runtime() === "browser") {
      const text = new TextDecoder().decode(row.content);
      const rel = this.relativePath(target);
      this.browserWrite(rel, text);
      return { ok: true, from: row.path, to: rel, bytes: row.content.byteLength };
    }
    const rel = this.relativePath(target);
    const sandbox = new Files(this.container);
    const dir = target.slice(0, target.lastIndexOf("/"));
    if (dir && dir !== WORKSPACE) await this.run(["mkdir", "-p", dir]);
    await sandbox.writeFile(target, new Uint8Array(row.content));
    this.upsertFilesCache(target, row.content.byteLength);
    return { ok: true, from: row.path, to: rel, bytes: row.content.byteLength };
  }

  private async finishMigration(): Promise<{ ok: true; files: number }> {
    const migration = this.migrationRow();
    if (!migration || migration.status !== "active") {
      throw new Error("no active migration");
    }
    if (this.runtime() === "container") {
      await this.sh(`rm -rf ${WORKSPACE}/${MIGRATION_DIR}`);
    }
    const count = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM atoms_migration_files")
      .one().n;
    this.ctx.storage.sql.exec("DELETE FROM atoms_migration_files");
    if (migration.source_runtime === "browser") {
      this.ctx.storage.sql.exec("DELETE FROM atoms_file_content");
    }
    this.ctx.storage.sql.exec("DELETE FROM atoms_migration WHERE id = ?", this.projectId);
    await this.syncFilesCacheSafe();
    return { ok: true, files: count };
  }

  /**
   * 切换 runtime/模板。只允许切到容量不低于当前的 runtime。
   * 旧文件先导出到 atoms_migration_files，再重置到目标模板；
   * 模型通过迁移工具选择要复制/改写的文件。
   */
  private async switchRuntime(targetInput: TemplateId): Promise<{
    ok: true;
    migration: boolean;
    targetTemplate: TemplateId;
    targetRuntime: RuntimeKind;
  }> {
    if (!this.configured()) throw new Error("project is not configured");
    const targetTemplate = targetInput;
    const targetRuntime = runtimeForTemplate(targetTemplate);
    const sourceTemplate = this.template();
    const sourceRuntime = this.runtime();
    const sourceTier = this.instanceTier();

    if (targetTemplate === sourceTemplate && targetRuntime === sourceRuntime) {
      return {
        ok: true,
        migration: false,
        targetTemplate,
        targetRuntime,
      };
    }

    const targetTier: InstanceTier =
      targetRuntime === "browser"
        ? "basic"
        : sourceRuntime === "container"
          ? sourceTier
          : "basic";
    if (
      capacityRank(targetRuntime, targetTier) <
      capacityRank(sourceRuntime, sourceTier)
    ) {
      throw new Error(
        `不支持从 ${sourceRuntime}/${sourceTier} 切换到更小的 ${targetRuntime}/${targetTier}`,
      );
    }

    if (sourceRuntime === "container") {
      await this.ensure();
      await this.takeSnapshot();
    }
    const snapshotId = sourceRuntime === "container" ? this.snapshotId() : null;
    const archive = await this.exportWorkspaceArchive();
    const now = Date.now();

    this.ctx.storage.sql.exec(
      "DELETE FROM atoms_migration WHERE id = ?",
      this.projectId,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_migration
        (id, status, source_template, source_runtime, source_instance,
         target_template, target_runtime, target_instance, snapshot_id,
         archive_files, archive_bytes, skipped, created_at)
       VALUES (?, 'preparing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      this.projectId,
      sourceTemplate,
      sourceRuntime,
      sourceTier,
      targetTemplate,
      targetRuntime,
      targetTier,
      snapshotId,
      archive.files,
      archive.bytes,
      JSON.stringify(archive.skipped),
      now,
    );

    this.setConfig(targetTemplate, targetRuntime);
    if (targetRuntime === "container") {
      this.setInstanceTier(targetTier);
    }

    if (targetRuntime === "container") {
      if (sourceRuntime === "browser") {
        this.container.start({
          image: this.container.images["base"],
          entrypoint: ENTRYPOINT,
          enableInternet: true,
          instance: targetTier,
        });
        await this.waitRunning();
        await this.container.setInactivityTimeout(
          SANDBOX_INACTIVITY_TIMEOUT_MS,
        );
      }
      await this.resetToTemplate(targetTemplate);
      await this.ensureMigrationIgnored();
      await this.writeMigrationArchiveToWorkspace();
      await this.ensurePreview();
      await this.restartPreview();
      // 目标环境已经可用；把快照指向目标，避免 worker 重启后从旧模板快照恢复。
      await this.takeSnapshot();
    } else {
      // 单向规则：容量不低于当前。browser 只可能是 source=browser 且 target 相同，
      // 上面已经 no-op；保留显式错误，避免未来悄悄破坏这个规则。
      throw new Error("browser runtime switch is not supported");
    }

    this.ctx.storage.sql.exec("DELETE FROM atoms_files");
    this.ctx.storage.sql.exec(
      "UPDATE atoms_versions SET archived = 1",
    );
    this.ctx.storage.sql.exec(
      "UPDATE atoms_workspace SET current_version_id = NULL WHERE id = ?",
      this.projectId,
    );
    this.ctx.storage.sql.exec(
      "UPDATE atoms_migration SET status = 'active' WHERE id = ?",
      this.projectId,
    );
    this.ensurePromise = null;
    await this.syncFilesCacheSafe();
    return { ok: true, migration: true, targetTemplate, targetRuntime };
  }

  /**
   * 只在「从未生成过任何内容」时铺模板。
   * .git 存在说明已经有工作区历史，绝不覆盖。
   */
  private async seed(forceTemplate?: TemplateId): Promise<void> {
    const forced = !!forceTemplate;
    const hasGit = await this.run(["test", "-d", `${WORKSPACE}/.git`]);
    if (hasGit.exitCode === 0 && !forced) return;

    if (!forced && this.versionCount() > 0) {
      throw new Error(
        "workspace lost: versions exist but .git is missing (snapshot restore failed); refusing to overwrite",
      );
    }

    const template = forceTemplate ?? this.template();
    let dir = `/opt/templates/${template}`;
    const exists = await this.run(["test", "-d", dir]);
    if (exists.exitCode !== 0) {
      console.error("[workspace] template missing, falling back to static", template);
      dir = "/opt/templates/static";
    }

    // 复制源码（不含 node_modules），再把依赖软链到镜像里的预装目录。
    await this.sh(
      `mkdir -p ${WORKSPACE} && cd ${dir} && for entry in * .[!.]*; do ` +
        `[ "$entry" = "node_modules" ] && continue; ` +
        `[ "$entry" = ".data" ] && continue; ` +
        `[ -e "$entry" ] || continue; ` +
        `cp -R "$entry" ${WORKSPACE}/; ` +
        `done`,
    );

    const hasModules = await this.run(["test", "-d", `${dir}/node_modules`]);
    if (hasModules.exitCode === 0) {
      // 每项目一份真实 node_modules，后续 install_packages 不会改到共享模板。
      await this.sh(
        `rm -rf ${WORKSPACE}/node_modules && cp -a ${dir}/node_modules ${WORKSPACE}/node_modules`,
      );
    }

    await this.signalPreviewRestart();
    await this.sh(
      `cd ${WORKSPACE} && git init -q && git config user.email atoms@local && git config user.name atoms-lite && git add -A && git commit -q -m template`,
    );
  }

  private async checkPreview(): Promise<boolean> {
    try {
      const port = this.container.getTcpPort(PREVIEW_PORT);
      const health = await port.fetch(new Request("http://preview/healthz"));
      // 根页面必须真的可访问；缺 dist 时不再假装“就绪”。
      const root = await port.fetch(new Request("http://preview/"));
      if (root.status !== 200) return false;
      if (health.status === 200) return true;
      // 旧快照没有 /healthz：root 200 也说明静态服务是活的
      return health.status === 404;
    } catch {
      return false;
    }
  }

  private async ensurePreview(): Promise<void> {
    if (await this.checkPreview()) return;

    await this.signalPreviewRestart();

    const hasBoot = await this.run(["test", "-f", "/opt/preview/boot.sh"]);
    if (hasBoot.exitCode === 0) {
      await this.sh(
        `cd ${WORKSPACE} && (pgrep -f '^sh /opt/preview/boot.sh$' >/dev/null || nohup sh /opt/preview/boot.sh >/tmp/preview.log 2>&1 &)`,
      );
    } else {
      // 兼容旧快照：只有静态 server.mjs
      await this.sh(
        `cd ${WORKSPACE} && (pgrep -f '^node /opt/preview/server.mjs$' >/dev/null || nohup node /opt/preview/server.mjs >/tmp/preview.log 2>&1 &)`,
      );
    }

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (await this.checkPreview()) return;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("preview server did not become ready");
  }

  /** 让 supervisor 重新读取 runtime.json；用于 seed、build 和 start_preview。 */
  private async restartPreview(): Promise<void> {
    await this.signalPreviewRestart();

    // supervisor 每 1s 检查 restart，然后 kill 旧子进程、sleep 2s、再启动新进程。
    // 不能只等「ready」：旧进程在重启前仍会返回 200，会让调用方误以为已完成，
    // 前端 iframe 就会加载旧产物。这里要求先观察到 down，再观察到 ready。
    const deadline = Date.now() + 60_000;
    let sawDown = false;
    let nextSignalAt = Date.now() + 8_000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const ready = await this.checkPreview();

      if (sawDown) {
        if (ready) return;
        continue;
      }

      if (!ready) {
        sawDown = true;
        continue;
      }

      if (Date.now() >= nextSignalAt) {
        // 信号可能碰上了 supervisor 的启动窗口；重发一次。
        await this.signalPreviewRestart();
        nextSignalAt = Date.now() + 8_000;
      }
    }

    await this.ensurePreview();
  }

  private async build(): Promise<{
    skipped: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  }> {
    if (this.runtime() === "browser") {
      return {
        skipped: true,
        exitCode: 0,
        stdout: "browser-static 运行时不需要构建。",
        stderr: "",
        durationMs: 0,
      };
    }

    // 与 createVersion / checkout 共用队列，避免并发写 dist 和 git。
    return this.exclusive(async () => {
      await this.ensure();
      const runtime = await this.runtimeConfig();
      const command = runtime.buildCommand;

      if (!command) {
        return {
          skipped: true,
          exitCode: 0,
          stdout: "该模板不需要构建。",
          stderr: "",
          durationMs: 0,
        };
      }

      const started = Date.now();
      try {
        const out = await this.sh(
          `cd ${WORKSPACE} && ${command}`,
          BUILD_TIMEOUT_MS,
        );
        await this.syncFilesCacheSafe();
        return {
          skipped: false,
          exitCode: out.exitCode,
          stdout: out.stdout.slice(0, EXEC_MAX_OUTPUT_BYTES),
          stderr: out.stderr.slice(0, 32 * 1024),
          durationMs: Date.now() - started,
        };
      } catch (error) {
        return {
          skipped: false,
          exitCode: -1,
          stdout: "",
          stderr: String(error).slice(0, 32 * 1024),
          durationMs: Date.now() - started,
        };
      }
    });
  }

  private async ensure(): Promise<void> {
    if (!this.configured()) {
      throw new Error("project is not configured yet");
    }
    if (this.runtime() === "browser") {
      this.ensurePromise ??= this.seedBrowser().catch((error) => {
        this.ensurePromise = null;
        throw error;
      });
      return this.ensurePromise;
    }

    if (!this.container.running) this.ensurePromise = null;

    this.ensurePromise ??= this.doEnsure().catch((error) => {
      this.ensurePromise = null;
      throw error;
    });

    return this.ensurePromise;
  }

  private async doEnsure(): Promise<void> {
    const container = this.container;

    if (!container.running) {
      const snap = this.snapshotId();
      const hasVersions = this.versionCount() > 0;

      if (snap) {
        try {
          container.start({
            containerSnapshot: { id: snap },
            entrypoint: ENTRYPOINT,
            enableInternet: true,
            instance: this.instanceTier(),
          });
        } catch (error) {
          console.error("[workspace] snapshot restore failed", error);
          if (hasVersions) {
            throw new Error(
              "snapshot restore failed and versions exist; refusing to start an empty workspace",
            );
          }
          container.start({
            image: container.images["base"],
            entrypoint: ENTRYPOINT,
            enableInternet: true,
            instance: this.instanceTier(),
          });
        }
      } else {
        if (hasVersions) {
          throw new Error(
            "no snapshot but versions exist; refusing to start an empty workspace",
          );
        }
        container.start({
          image: container.images["base"],
          entrypoint: ENTRYPOINT,
          enableInternet: true,
          instance: this.instanceTier(),
        });
      }

      await container.setInactivityTimeout(SANDBOX_INACTIVITY_TIMEOUT_MS);
      await this.waitRunning();
    }

    await this.seed();
    await this.ensureNodeModules();
    await this.ensurePreview();
    await this.syncFilesCacheSafe();
  }

  /**
   * 全栈项目的 SQLite 数据在容器里；用户写入后延迟一次快照，
   * 避免空闲回收时丢掉最后一次操作。真实生产应换 D1。
   */
  override async alarm(): Promise<void> {
    if (this.template() !== "fullstack-hono") return;
    if (!this.container.running) return;
    await this.exclusive(async () => {
      if (!this.container.running) return;
      const result = await this.takeSnapshot();
      console.log("[workspace] snapshot after app mutation", {
        projectId: this.projectId,
        ok: result.ok,
      });
    });
  }

  private async ensureNodeModules(): Promise<void> {
    const template = this.template();
    if (template === "static") return;

    const isLink = await this.run(["test", "-L", `${WORKSPACE}/node_modules`]);
    if (isLink.exitCode === 0) {
      // 旧项目是软链；安装依赖前升级为项目自己的副本。
      await this.sh(
        `rm -f ${WORKSPACE}/node_modules && cp -a /opt/templates/${template}/node_modules ${WORKSPACE}/node_modules`,
      );
    }
  }

  private async upgradeInstance(): Promise<{
    tier: InstanceTier;
    upgraded: boolean;
    max?: boolean;
    error?: string;
  }> {
    if (this.runtime() === "browser") {
      return {
        tier: "basic",
        upgraded: false,
        error: "browser runtime does not use a container",
      };
    }

    return this.exclusive(async () => {
      const current = this.instanceTier();
      const next = nextInstanceTier(current);
      if (!next) {
        return { tier: current, upgraded: false, max: true };
      }

      await this.ensure();
      const snapshot = await this.takeSnapshot();
      if (!snapshot.ok) {
        return {
          tier: current,
          upgraded: false,
          error: `snapshot failed: ${snapshot.error ?? "unknown"}`,
        };
      }

      this.setInstanceTier(next);
      try {
        await this.container.destroy();
      } catch (error) {
        return {
          tier: next,
          upgraded: false,
          error: `destroy failed: ${String(error).slice(0, 300)}`,
        };
      }

      this.ensurePromise = null;
      await this.ensure();
      await this.restartPreview();
      return { tier: next, upgraded: true };
    });
  }

  private setSnapshotStatus(ok: boolean, error?: string): void {
    this.ctx.storage.sql.exec(
      "UPDATE atoms_runtime_status SET snapshot_error = ?, snapshot_at = ? WHERE id = ?",
      ok ? null : (error ?? "snapshot failed").slice(0, 500),
      Date.now(),
      this.projectId,
    );
  }

  private async takeSnapshot(): Promise<{ ok: boolean; error?: string }> {
    try {
      const snap = await this.container.snapshotContainer({ name: "atoms-lite" });
      this.ctx.storage.sql.exec(
        `INSERT INTO atoms_snapshots (project_id, snapshot_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, created_at = excluded.created_at`,
        this.projectId,
        snap.id,
        Date.now(),
      );
      this.setSnapshotStatus(true);
      return { ok: true };
    } catch (error) {
      console.error("[workspace] snapshot failed", error);
      const message = String(error).slice(0, 500);
      this.setSnapshotStatus(false, message);
      return { ok: false, error: message };
    }
  }

  private latestVersion(): VersionRow | null {
    const current = this.currentVersionId();
    const rows = this.ctx.storage.sql
      .exec<VersionDbRow>(
        current
          ? "SELECT * FROM atoms_versions WHERE id = ?"
          : "SELECT * FROM atoms_versions WHERE archived = 0 ORDER BY created_at DESC LIMIT 1",
        ...(current ? [current] : []),
      )
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      gitCommit: row.git_commit,
      parentId: row.parent_id,
      summary: row.summary,
      status: row.status,
      archived: row.archived === 1,
      createdAt: row.created_at,
      current: true,
    };
  }

  private listVersions(): VersionRow[] {
    const rows = this.ctx.storage.sql
      .exec<VersionDbRow>("SELECT * FROM atoms_versions ORDER BY created_at ASC")
      .toArray();
    const current =
      this.currentVersionId() ??
      rows.find((row) => row.archived === 0)?.id ??
      null;
    return rows.map((r) => ({
      id: r.id,
      gitCommit: r.git_commit,
      parentId: r.parent_id,
      summary: r.summary,
      status: r.status,
      archived: r.archived === 1,
      createdAt: r.created_at,
      current: current !== null && r.id === current,
    }));
  }

  private async createVersion(summary: string) {
    if (this.migrationRow()?.status === "active") {
      throw new Error("migration is active; finish_migration first");
    }
    if (this.runtime() === "browser") {
      return this.createBrowserVersion(summary);
    }
    return this.exclusive(async () => {
      await this.ensure();

      // 清理上次超时 kill 留下的锁
      await this.sh(`cd ${WORKSPACE} && rm -f .git/index.lock`);

      const files = new Files(this.container);
      await files.writeFile("/tmp/commit-msg", summary || "update");

      await this.sh(`cd ${WORKSPACE} && git add -A`);
      const diff = await this.run(["git", "diff", "--cached", "--quiet"], WORKSPACE);

      if (diff.exitCode === 0) {
        const existing = this.latestVersion();
        if (existing) {
          return {
            versionId: existing.id,
            gitCommit: existing.gitCommit,
            skipped: true,
            snapshotOk: true,
          };
        }
      }

      const out = await this.sh(
        `cd ${WORKSPACE} && git commit -q -F /tmp/commit-msg && git rev-parse HEAD`,
      );
      if (out.exitCode !== 0) {
        throw new Error(out.stderr || "git commit failed");
      }

      const gitCommit = out.stdout.trim();
      const parent = this.latestVersion();
      const id = `ver_${crypto.randomUUID()}`;

      this.ctx.storage.sql.exec(
        "INSERT INTO atoms_versions (id, git_commit, parent_id, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        gitCommit,
        parent?.id ?? null,
        summary,
        "draft",
        Date.now(),
      );
      this.setCurrentVersion(id);

      await this.syncFilesCacheSafe();
      const snapshot = await this.takeSnapshot();
      if (!snapshot.ok) {
        this.ctx.storage.sql.exec(
          "UPDATE atoms_versions SET status = 'failed' WHERE id = ?",
          id,
        );
      }
      return {
        versionId: id,
        gitCommit,
        skipped: false,
        snapshotOk: snapshot.ok,
        snapshotError: snapshot.error,
      };
    });
  }

  private async checkout(versionId: string) {
    const archived = this.ctx.storage.sql
      .exec<{ archived: number }>(
        "SELECT archived FROM atoms_versions WHERE id = ?",
        versionId,
      )
      .toArray()[0];
    if (!archived) throw new Error(`version not found: ${versionId}`);
    if (archived.archived === 1) {
      throw new Error("this version was archived by a runtime switch");
    }
    if (this.runtime() === "browser") {
      return this.checkoutBrowser(versionId);
    }
    return this.exclusive(async () => {
      await this.ensure();

      const rows = this.ctx.storage.sql
        .exec<{ git_commit: string }>(
          "SELECT git_commit FROM atoms_versions WHERE id = ?",
          versionId,
        )
        .toArray();
      const target = rows[0];
      if (!target) throw new Error(`version not found: ${versionId}`);

      await this.sh(`cd ${WORKSPACE} && rm -f .git/index.lock`);
      const out = await this.sh(
        `cd ${WORKSPACE} && git reset --hard ${target.git_commit} && git clean -fd`,
      );
      if (out.exitCode !== 0) throw new Error(out.stderr || "checkout failed");

      this.setCurrentVersion(versionId);

      // git clean 不会删除被 ignore 的 dist；先清掉再重建。
      await this.sh(`rm -rf ${WORKSPACE}/dist`);
      let buildError: string | null = null;
      const runtime = await this.runtimeConfig();
      if (runtime.buildCommand) {
        try {
          const build = await this.sh(
            `cd ${WORKSPACE} && ${runtime.buildCommand}`,
            BUILD_TIMEOUT_MS,
          );
          if (build.exitCode !== 0) {
            buildError =
              (build.stderr || build.stdout || "build failed").slice(0, 2000);
          }
        } catch (error) {
          buildError = String(error).slice(0, 2000);
        }
      }

      await this.syncFilesCacheSafe();
      if (!buildError) {
        await this.restartPreview();
      }
      const snapshot = await this.takeSnapshot();

      return {
        ok: buildError === null,
        gitCommit: target.git_commit,
        buildError,
        snapshotOk: snapshot.ok,
        snapshotError: snapshot.error,
      };
    });
  }

  private async handleFiles(): Promise<FileEntry[]> {
    // busybox find 不支持 -printf；用 wc -c 输出 "size path"
    const out = await this.run([
      "find",
      WORKSPACE,
      "-type",
      "f",
      "-not",
      "-path",
      "*/.git/*",
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*/dist/*",
      "-not",
      "-path",
      "*/.atoms-lite/*",
      "-not",
      "-path",
      "*/.atoms/*",
      "-not",
      "-path",
      "*/_sandbox_migration/*",
      "-exec",
      "wc",
      "-c",
      "{}",
      "+",
    ]);

    const entries: FileEntry[] = [];
    for (const line of out.stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) continue;
      const rawPath = match[2];
      if (!rawPath || rawPath === "total") continue;
      entries.push({
        path: rawPath.replace(`${WORKSPACE}/`, ""),
        type: "file",
        size: Number(match[1]),
      });
    }
    return entries;
  }

  private async previewProxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const rest =
      url.pathname.slice(`/previews/${this.projectId}`.length) || "/";

    if (this.runtime() === "browser") {
      await this.ensure();
      return this.serveBrowserFile(rest);
    }

    // 旧快照的 server.mjs 可能没有 .git 防护；在这一层统一拦截。
    let decodedRest = rest;
    try {
      decodedRest = decodeURIComponent(rest);
    } catch {
      // 非法转义交给容器返回 400
    }
    if (isInternalPath(decodedRest)) {
      return new Response("not found", { status: 404 });
    }

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      await this.ensure();
      const target = new URL(request.url);
      target.protocol = "http:";
      target.host = "preview";
      target.pathname = rest;
      const headers = new Headers(request.headers);
      headers.delete("host");
      return this.container.getTcpPort(PREVIEW_PORT).fetch(target.toString(), {
        method: request.method,
        headers,
      });
    }
    // 容器里的预览服务只支持 HTTP；生产入站是 HTTPS，必须换 scheme
    const target = new URL(request.url);
    target.protocol = "http:";
    target.host = "preview";
    target.pathname = rest;

    const headers = new Headers(request.headers);
    headers.delete("host");
    const isRead =
      request.method === "GET" || request.method === "HEAD";

    let response: Response | null = null;
    for (let attempt = 0; attempt < (isRead ? 3 : 1); attempt += 1) {
      try {
        await this.ensure();
        response = await this.container
          .getTcpPort(PREVIEW_PORT)
          .fetch(target.toString(), {
            method: request.method,
            headers,
            body: isRead ? undefined : request.body,
          });
        break;
      } catch (error) {
        console.error("[workspace] preview proxy failed", {
          projectId: this.projectId,
          attempt,
          error: String(error).slice(0, 200),
        });
        if (attempt < 2) {
          // ensure 可能拿到一个已结束的旧 promise；重置后让下一次重新检查/启动。
          this.ensurePromise = null;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
    }

    if (!response) {
      return new Response("预览暂时不可用，请稍后刷新重试。", {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // 全栈应用的 POST/PATCH/DELETE 可能在写 SQLite；延迟快照保数据。
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      response.ok &&
      this.template() === "fullstack-hono"
    ) {
      await this.ctx.storage.setAlarm(Date.now() + 10_000);
    }

    return response;
  }

  override async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const previewPrefix = `/previews/${this.projectId}`;
      if (path === previewPrefix || path.startsWith(`${previewPrefix}/`)) {
        return await this.previewProxy(request);
      }

      if (path === "/ensure") {
        await this.ensure();
        return Response.json({ ok: true, running: this.container.running });
      }

      if (path === "/destroy") {
        try {
          if (this.container.running) await this.container.destroy();
        } catch (error) {
          console.error("[workspace] container destroy failed", error);
        }
        // 保留 schema，只清空数据；deleteAll 会让活跃 isolate 的后续请求撞 no such table。
        for (const table of [
          "atoms_versions",
          "atoms_snapshots",
          "atoms_files",
          "atoms_file_content",
          "atoms_file_versions",
          "atoms_dependencies",
          "atoms_runtime_status",
          "atoms_project_config",
          "atoms_workspace",
        ]) {
          try {
            this.ctx.storage.sql.exec(`DELETE FROM ${table}`);
          } catch (error) {
            console.error("[workspace] clear table failed", table, error);
          }
        }
        // 保留最小默认行，避免同 ID 被直接访问时依赖 constructor 时机。
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO atoms_workspace (id, current_version_id) VALUES (?, NULL)",
          this.projectId,
        );
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO atoms_project_config (id, template, runtime, instance_tier, updated_at) VALUES (?, 'static', 'container', 'basic', 0)",
          this.projectId,
        );
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO atoms_runtime_status (id, snapshot_error, snapshot_at) VALUES (?, NULL, NULL)",
          this.projectId,
        );
        this.ensurePromise = null;
        return Response.json({ ok: true });
      }

      if (path === "/config") {
        const body = (await request.json()) as {
          template?: string;
          runtime?: string;
          configured?: boolean | number;
        };
        if (this.versionCount() > 0) {
          return Response.json(
            { error: "template is locked after the first version" },
            { status: 409 },
          );
        }
        this.setConfig(
          normalizeTemplate(body.template),
          normalizeRuntime(body.runtime),
          body.configured !== false && body.configured !== 0,
        );
        return Response.json({
          ok: true,
          template: this.template(),
          runtime: this.runtime(),
          configured: this.configured(),
        });
      }

      if (path === "/runtime/switch" && request.method === "POST") {
        const body = (await request.json()) as { template?: string };
        const target = normalizeTemplate(body.template);
        return Response.json(
          await this.exclusive(() => this.switchRuntime(target)),
        );
      }

      if (path === "/migration/list") {
        return Response.json({
          entries: this.migrationFiles(),
          manifest: this.migrationManifest(),
        });
      }

      if (path === "/migration/read" && request.method === "POST") {
        const body = (await request.json()) as {
          path?: string;
          offset?: number;
          limit?: number;
        };
        return Response.json(
          await this.readMigrationFile(
            body.path ?? "",
            body.offset,
            body.limit,
          ),
        );
      }

      if (path === "/migration/copy" && request.method === "POST") {
        const body = (await request.json()) as {
          from?: string;
          to?: string;
        };
        if (!body.from || !body.to) {
          return Response.json(
            { error: "from and to are required" },
            { status: 400 },
          );
        }
        return Response.json(
          await this.copyMigrationFile(body.from, body.to),
        );
      }

      if (path === "/migration/finish" && request.method === "POST") {
        return Response.json(await this.finishMigration());
      }

      if (path === "/meta") {
        // 只读 SQL，不启动容器：首页列表用
        const current = this.latestVersion();
        return Response.json({
          template: this.template(),
          runtime: this.runtime(),
          configured: this.configured(),
          running:
            this.runtime() === "container" ? this.container.running : false,
          instanceTier: this.instanceTier(),
          snapshotError:
            this.ctx.storage.sql
              .exec<{ snapshot_error: string | null }>(
                "SELECT snapshot_error FROM atoms_runtime_status WHERE id = ?",
                this.projectId,
              )
              .toArray()[0]?.snapshot_error ?? null,
          snapshotAt:
            this.ctx.storage.sql
              .exec<{ snapshot_at: number | null }>(
                "SELECT snapshot_at FROM atoms_runtime_status WHERE id = ?",
                this.projectId,
              )
              .toArray()[0]?.snapshot_at ?? null,
          migration: this.migrationInfo(),
          versionCount: this.versionCount(),
          currentVersion: current
            ? {
                id: current.id,
                gitCommit: current.gitCommit,
                summary: current.summary,
                createdAt: current.createdAt,
              }
            : null,
        });
      }

      if (path === "/files") {
        if (!this.configured()) {
          return Response.json({
            entries: [],
            running: false,
            cachedAt: 0,
            configured: false,
          });
        }
        if (this.runtime() === "browser") {
          await this.ensure();
          return Response.json({
            entries: this.browserFiles(),
            running: false,
            cachedAt: this.browserCachedAt(),
          });
        }
        // 容器项目默认只读 SQL 缓存，不启动容器
        return Response.json({
          entries: this.cachedFiles(),
          running: this.container.running,
          cachedAt: this.filesCachedAt(),
        });
      }

      if (path === "/files/refresh") {
        await this.ensure();
        if (this.runtime() === "browser") {
          return Response.json({
            entries: this.browserFiles(),
            running: false,
            cachedAt: this.browserCachedAt(),
          });
        }
        const entries = await this.syncFilesCache();
        return Response.json({
          entries,
          running: true,
          cachedAt: this.filesCachedAt(),
        });
      }

      // Agent 的 list_files：需要真实工作区
      if (path === "/tools/list") {
        await this.ensure();
        if (this.runtime() === "browser") {
          return Response.json({ entries: this.browserFiles() });
        }
        return Response.json({ entries: await this.syncFilesCache() });
      }

      if (path === "/tools/write") {
        const body = (await request.json()) as { path: string; content: string };
        await this.ensure();
        if (this.runtime() === "browser") {
          const rel = this.relativePath(body.path);
          this.browserWrite(rel, body.content);
          return Response.json({ path: body.path, bytes: body.content.length });
        }
        const target = safePath(body.path);
        const dir = target.slice(0, target.lastIndexOf("/")) || WORKSPACE;
        await this.run(["mkdir", "-p", dir]);
        const files = new Files(this.container);
        await files.writeFile(target, body.content);
        // 写文件只做局部缓存更新；exec/build/版本操作再做全量校准。
        this.upsertFilesCache(
          target,
          new TextEncoder().encode(body.content).length,
        );
        return Response.json({ path: target, bytes: body.content.length });
      }

      if (path === "/tools/edit" && request.method === "POST") {
        const body = (await request.json()) as {
          path: string;
          oldString: string;
          newString: string;
          replaceAll?: boolean;
        };
        await this.ensure();
        if (this.runtime() === "browser") {
          const rel = this.relativePath(body.path);
          const content = this.browserContent(rel);
          if (content === null) {
            return Response.json({ error: "file not found" }, { status: 404 });
          }
          const first = content.indexOf(body.oldString);
          if (first < 0) {
            return Response.json(
              { error: "oldString not found in file" },
              { status: 409 },
            );
          }
          if (!body.replaceAll && content.indexOf(body.oldString, first + 1) >= 0) {
            return Response.json(
              { error: "oldString matches multiple places; add more context or set replaceAll" },
              { status: 409 },
            );
          }
          const next = body.replaceAll
            ? content.split(body.oldString).join(body.newString)
            : content.slice(0, first) +
              body.newString +
              content.slice(first + body.oldString.length);
          this.browserWrite(rel, next);
          return Response.json({
            path: body.path,
            replaced: body.replaceAll
              ? content.split(body.oldString).length - 1
              : 1,
            bytes: next.length,
          });
        }
        const target = safePath(body.path);
        const files = new Files(this.container);
        const current = await (await files.readFile(target)).text();
        const first = current.indexOf(body.oldString);
        if (first < 0) {
          return Response.json(
            { error: "oldString not found in file" },
            { status: 409 },
          );
        }
        if (!body.replaceAll && current.indexOf(body.oldString, first + 1) >= 0) {
          return Response.json(
            { error: "oldString matches multiple places; add more context or set replaceAll" },
            { status: 409 },
          );
        }
        const next = body.replaceAll
          ? current.split(body.oldString).join(body.newString)
          : current.slice(0, first) +
            body.newString +
            current.slice(first + body.oldString.length);
        await files.writeFile(target, next);
        this.upsertFilesCache(target, new TextEncoder().encode(next).length);
        return Response.json({
          path: target,
          replaced: body.replaceAll
            ? current.split(body.oldString).length - 1
            : 1,
          bytes: new TextEncoder().encode(next).length,
        });
      }

      if (path === "/tools/read") {
        const body = (await request.json()) as { path: string };
        await this.ensure();
        if (this.runtime() === "browser") {
          const content = this.browserContent(this.relativePath(body.path));
          if (content === null) {
            return Response.json({ error: "file not found" }, { status: 404 });
          }
          return Response.json({ content, truncated: false });
        }
        const target = safePath(body.path);
        const files = new Files(this.container);
        const res = await files.readFile(target);
        const text = await res.text();
        return Response.json({ content: text, truncated: false });
      }

      if (path === "/tools/exec") {
        const body = (await request.json()) as {
          program: string;
          args?: string[];
          cwd?: string;
        };
        await this.ensure();

        if (this.runtime() === "browser") {
          return Response.json(
            { error: "browser-static runtime has no shell" },
            { status: 400 },
          );
        }

        if (!ALLOWED_PROGRAMS.has(body.program)) {
          return Response.json(
            { error: `command not allowed: ${body.program}` },
            { status: 400 },
          );
        }

        const cwd = safeCwd(body.cwd);
        const proc = await this.container.exec(
          [body.program, ...(body.args ?? [])],
          { cwd },
        );

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            proc.kill(9);
            reject(new Error("command timeout"));
          }, EXEC_TIMEOUT_MS);
        });

        try {
          const out = await Promise.race([proc.output(), timeout]);
          await this.syncFilesCacheSafe();
          const stdout = dec(out.stdout);
          const stderr = dec(out.stderr);
          return Response.json({
            exitCode: out.exitCode,
            stdout: stdout.slice(0, EXEC_MAX_OUTPUT_BYTES),
            stderr: stderr.slice(0, 32 * 1024),
            truncated:
              stdout.length > EXEC_MAX_OUTPUT_BYTES || stderr.length > 32 * 1024,
          });
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      if (path === "/tools/install") {
        const body = (await request.json()) as { packages?: string[] };
        let specs: ReturnType<typeof parsePackageSpec>[];
        try {
          specs = (body.packages ?? []).map(parsePackageSpec);
        } catch (error) {
          return Response.json(
            { error: String(error).slice(0, 200) },
            { status: 400 },
          );
        }
        if (specs.length === 0 || specs.length > 8) {
          return Response.json(
            { error: "packages must contain 1-8 entries" },
            { status: 400 },
          );
        }

        await this.ensure();

        if (this.runtime() === "browser") {
          const installed = specs.map((spec) => ({
            ...spec,
            url: `https://esm.sh/${spec.name}@${spec.version}`,
          }));
          this.ctx.storage.transactionSync(() => {
            for (const item of installed) {
              this.ctx.storage.sql.exec(
                `INSERT INTO atoms_dependencies (name, version, url, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(name) DO UPDATE SET version = excluded.version,
                   url = excluded.url, updated_at = excluded.updated_at`,
                item.name,
                item.version,
                item.url,
                Date.now(),
              );
            }
          });
          return Response.json({
            runtime: "browser",
            installed,
            imports: Object.fromEntries(
              installed.map((item) => [item.name, item.url]),
            ),
            hint: "用裸包名 import；预览会注入 importmap。",
          });
        }

        if (this.template() === "static") {
          return Response.json(
            { error: "this static project has no package manager" },
            { status: 400 },
          );
        }

        const out = await this.run(
          [
            "pnpm",
            "add",
            "--store-dir",
            "/pnpm-store",
            "--registry",
            "https://registry.npmmirror.com",
            ...specs.map((spec) => spec.spec),
          ],
          WORKSPACE,
          BUILD_TIMEOUT_MS,
          { CI: "true" },
        );
        await this.syncFilesCacheSafe();
        return Response.json({
          runtime: "container",
          exitCode: out.exitCode,
          stdout: out.stdout.slice(0, EXEC_MAX_OUTPUT_BYTES),
          stderr: out.stderr.slice(0, 32 * 1024),
        });
      }

      if (path === "/instance/upgrade" && request.method === "POST") {
        return Response.json(await this.upgradeInstance());
      }

      if (path === "/tools/build") {
        return Response.json(await this.build());
      }

      if (path === "/preview/status") {
        if (!this.configured()) {
          return Response.json({
            running: false,
            ready: false,
            configured: false,
          });
        }
        if (this.runtime() === "browser") {
          return Response.json({ running: false, ready: true });
        }
        // 只探测，不主动启动：iframe 请求本身会触发 ensure()
        const running = this.container.running;
        const ready = running ? await this.checkPreview() : false;
        return Response.json({ running, ready });
      }

      if (path === "/preview/start") {
        await this.ensure();
        if (this.runtime() === "browser") {
          return Response.json({
            status: "ready",
            url: `/previews/${this.projectId}/`,
          });
        }
        await this.restartPreview();
        return Response.json({
          status: "ready",
          url: `/previews/${this.projectId}/`,
        });
      }

      if (path === "/snapshot") {
        await this.ensure();
        if (this.runtime() === "browser") {
          return Response.json({ ok: true });
        }
        const snapshot = await this.takeSnapshot();
        return Response.json(snapshot);
      }

      if (path === "/preview/stop") {
        return Response.json(
          { error: "preview runs as the container entrypoint; stop the container instead" },
          { status: 400 },
        );
      }

      if (path === "/versions" && request.method === "POST") {
        const body = (await request.json()) as { summary?: string };
        const version = await this.createVersion(
          (body.summary ?? "update").slice(0, 200),
        );
        return Response.json(version);
      }

      if (path === "/versions" && request.method === "GET") {
        return Response.json({ versions: this.listVersions() });
      }

      if (path === "/versions/checkout") {
        const body = (await request.json()) as { versionId: string };
        return Response.json(await this.checkout(body.versionId));
      }

      return Response.json({ error: "not found" }, { status: 404 });
    } catch (error) {
      console.error("[workspace] request failed", path, error);
      return Response.json(
        { error: String(error).slice(0, 500) },
        { status: 500 },
      );
    }
  }
}
