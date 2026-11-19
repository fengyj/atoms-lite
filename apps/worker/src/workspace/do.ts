import { DurableObject } from "cloudflare:workers";
import { Files } from "@cloudflare/sandbox";
import {
  BUILD_TIMEOUT_MS,
  EXEC_MAX_OUTPUT_BYTES,
  EXEC_TIMEOUT_MS,
  SANDBOX_INACTIVITY_TIMEOUT_MS,
} from "@atoms-lite/contracts";
import type { Env } from "../env";
import type { ExecResult, FileEntry, VersionRow } from "./client";

const PREVIEW_PORT = 8080;
const WORKSPACE = "/workspace";

// boot.sh 是新镜像的 supervisor；旧快照没有该文件时回退到静态服务器。
const ENTRYPOINT = [
  "sh",
  "-c",
  "if [ -f /opt/preview/boot.sh ]; then exec sh /opt/preview/boot.sh; else exec node /opt/preview/server.mjs; fi",
];

const TEMPLATES = new Set(["static", "react-vite", "fullstack-hono"]);
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

function safePath(path: string): string {
  if (
    !path.startsWith(`${WORKSPACE}/`) ||
    path.includes("..") ||
    path.includes("/.git/")
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

type TemplateId = "static" | "react-vite" | "fullstack-hono";

type RuntimeConfig = {
  kind?: string;
  serveDir?: string;
  buildCommand?: string | null;
  startCommand?: string | null;
  port?: number;
};

function normalizeTemplate(value: unknown): TemplateId {
  return typeof value === "string" && TEMPLATES.has(value)
    ? (value as TemplateId)
    : "static";
}

type VersionDbRow = {
  id: string;
  git_commit: string;
  parent_id: string | null;
  summary: string;
  status: string;
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
        updated_at INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO atoms_workspace (id, current_version_id) VALUES (?, NULL)",
      this.projectId,
    );
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO atoms_project_config (id, template, updated_at) VALUES (?, 'static', 0)",
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
  ): Promise<ExecResult> {
    const proc = await this.container.exec(cmd, { cwd });

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

  private setTemplate(template: TemplateId): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO atoms_project_config (id, template, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET template = excluded.template, updated_at = excluded.updated_at`,
      this.projectId,
      template,
      Date.now(),
    );
  }

  private async runtimeConfig(): Promise<RuntimeConfig> {
    const out = await this.run([
      "cat",
      `${WORKSPACE}/.atoms/runtime.json`,
    ]);
    if (out.exitCode !== 0) {
      return { kind: "static", serveDir: ".", buildCommand: null };
    }
    try {
      return JSON.parse(out.stdout) as RuntimeConfig;
    } catch {
      return { kind: "static", serveDir: ".", buildCommand: null };
    }
  }

  private cachedFiles(): FileEntry[] {
    return this.ctx.storage.sql
      .exec<{ path: string; size: number }>(
        "SELECT path, size FROM atoms_files ORDER BY path",
      )
      .toArray()
      .map((row) => ({ path: row.path, type: "file" as const, size: row.size }));
  }

  private filesCachedAt(): number {
    return (
      this.ctx.storage.sql
        .exec<{ ts: number | null }>("SELECT MAX(updated_at) AS ts FROM atoms_files")
        .one().ts ?? 0
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
    try {
      await this.syncFilesCache();
    } catch (error) {
      console.error("[workspace] file cache sync failed", error);
    }
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

  /**
   * 只在「从未生成过任何内容」时铺模板。
   * .git 存在说明已经有工作区历史，绝不覆盖。
   */
  private async seed(): Promise<void> {
    const hasGit = await this.run(["test", "-d", `${WORKSPACE}/.git`]);
    if (hasGit.exitCode === 0) return;

    if (this.versionCount() > 0) {
      throw new Error(
        "workspace lost: versions exist but .git is missing (snapshot restore failed); refusing to overwrite",
      );
    }

    const template = this.template();
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
      await this.sh(
        `rm -rf ${WORKSPACE}/node_modules && ln -s ${dir}/node_modules ${WORKSPACE}/node_modules`,
      );
    }

    await this.sh(`mkdir -p ${WORKSPACE}/.atoms && touch ${WORKSPACE}/.atoms/restart`);
    await this.sh(
      `cd ${WORKSPACE} && git init -q && git config user.email atoms@local && git config user.name atoms-lite && git add -A && git commit -q -m template`,
    );
  }

  private async checkPreview(): Promise<boolean> {
    try {
      const res = await this.container
        .getTcpPort(PREVIEW_PORT)
        .fetch(new Request("http://preview/healthz"));
      if (res.status < 500) return true;

      // 兼容旧快照（没有 /healthz）：404 也说明服务是活的
      const root = await this.container
        .getTcpPort(PREVIEW_PORT)
        .fetch(new Request("http://preview/"));
      return root.status < 500;
    } catch {
      return false;
    }
  }

  private async ensurePreview(): Promise<void> {
    if (await this.checkPreview()) return;

    await this.sh(`mkdir -p ${WORKSPACE}/.atoms && touch ${WORKSPACE}/.atoms/restart`);

    const hasBoot = await this.run(["test", "-f", "/opt/preview/boot.sh"]);
    if (hasBoot.exitCode === 0) {
      await this.sh(
        `cd ${WORKSPACE} && (pgrep -f '/opt/preview/boot.sh' >/dev/null || nohup sh /opt/preview/boot.sh >/tmp/preview.log 2>&1 &)`,
      );
    } else {
      // 兼容旧快照：只有静态 server.mjs
      await this.sh(
        `cd ${WORKSPACE} && (pgrep -f '/opt/preview/server.mjs' >/dev/null || nohup node /opt/preview/server.mjs >/tmp/preview.log 2>&1 &)`,
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
    await this.sh(`mkdir -p ${WORKSPACE}/.atoms && touch ${WORKSPACE}/.atoms/restart`);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      if (await this.checkPreview()) return;
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
      const out = await this.sh(`cd ${WORKSPACE} && ${command}`, BUILD_TIMEOUT_MS);
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
  }

  private async ensure(): Promise<void> {
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
            enableInternet: false,
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
            enableInternet: false,
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
          enableInternet: false,
        });
      }

      await container.setInactivityTimeout(SANDBOX_INACTIVITY_TIMEOUT_MS);
      await this.waitRunning();
    }

    await this.seed();
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
    await this.takeSnapshot();
    console.log("[workspace] snapshot after app mutation", this.projectId);
  }

  private async takeSnapshot(): Promise<void> {
    try {
      const snap = await this.container.snapshotContainer({ name: "atoms-lite" });
      this.ctx.storage.sql.exec(
        `INSERT INTO atoms_snapshots (project_id, snapshot_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, created_at = excluded.created_at`,
        this.projectId,
        snap.id,
        Date.now(),
      );
    } catch (error) {
      console.error("[workspace] snapshot failed", error);
    }
  }

  private latestVersion(): VersionRow | null {
    const current = this.currentVersionId();
    const rows = this.ctx.storage.sql
      .exec<VersionDbRow>(
        current
          ? "SELECT * FROM atoms_versions WHERE id = ?"
          : "SELECT * FROM atoms_versions ORDER BY created_at DESC LIMIT 1",
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
      createdAt: row.created_at,
      current: true,
    };
  }

  private listVersions(): VersionRow[] {
    const rows = this.ctx.storage.sql
      .exec<VersionDbRow>("SELECT * FROM atoms_versions ORDER BY created_at ASC")
      .toArray();
    const current = this.currentVersionId() ?? rows[rows.length - 1]?.id;
    return rows.map((r) => ({
      id: r.id,
      gitCommit: r.git_commit,
      parentId: r.parent_id,
      summary: r.summary,
      status: r.status,
      createdAt: r.created_at,
      current: r.id === current,
    }));
  }

  private async createVersion(summary: string) {
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
      await this.takeSnapshot();
      return { versionId: id, gitCommit, skipped: false };
    });
  }

  private async checkout(versionId: string) {
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

      // 源码回滚后重建，避免预览继续使用旧 dist。
      const runtime = await this.runtimeConfig();
      if (runtime.buildCommand) {
        try {
          await this.sh(`cd ${WORKSPACE} && ${runtime.buildCommand}`, BUILD_TIMEOUT_MS);
        } catch (error) {
          console.error("[workspace] rebuild after checkout failed", error);
        }
      }
      await this.syncFilesCacheSafe();
      await this.restartPreview();
      await this.takeSnapshot();

      return { ok: true, gitCommit: target.git_commit };
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
      "*/.atoms/restart",
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
    await this.ensure();
    const url = new URL(request.url);

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.container.getTcpPort(PREVIEW_PORT).fetch(request);
    }

    const rest =
      url.pathname.slice(`/previews/${this.projectId}`.length) || "/";
    // 容器里的预览服务只支持 HTTP；生产入站是 HTTPS，必须换 scheme
    const target = new URL(request.url);
    target.protocol = "http:";
    target.host = "preview";
    target.pathname = rest;

    const headers = new Headers(request.headers);
    headers.delete("host");

    const response = await this.container
      .getTcpPort(PREVIEW_PORT)
      .fetch(target.toString(), {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : request.body,
      });

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
        try {
          await this.ctx.storage.deleteAll();
        } catch (error) {
          console.error("[workspace] storage delete failed", error);
        }
        this.ensurePromise = null;
        return Response.json({ ok: true });
      }

      if (path === "/config") {
        const body = (await request.json()) as { template?: string };
        this.setTemplate(normalizeTemplate(body.template));
        return Response.json({ ok: true, template: this.template() });
      }

      if (path === "/meta") {
        // 只读 SQL，不启动容器：首页列表用
        const current = this.latestVersion();
        return Response.json({
          template: this.template(),
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
        // 默认只读 SQL 缓存，不启动容器
        return Response.json({
          entries: this.cachedFiles(),
          running: this.container.running,
          cachedAt: this.filesCachedAt(),
        });
      }

      if (path === "/files/refresh") {
        await this.ensure();
        const entries = await this.syncFilesCache();
        return Response.json({
          entries,
          running: true,
          cachedAt: this.filesCachedAt(),
        });
      }

      // Agent 的 list_files：需要真实工作区，允许启动容器
      if (path === "/tools/list") {
        await this.ensure();
        return Response.json({ entries: await this.syncFilesCache() });
      }

      if (path === "/tools/write") {
        const body = (await request.json()) as { path: string; content: string };
        await this.ensure();
        const target = safePath(body.path);
        const dir = target.slice(0, target.lastIndexOf("/")) || WORKSPACE;
        await this.sh(`mkdir -p ${dir}`);
        const files = new Files(this.container);
        await files.writeFile(target, body.content);
        await this.syncFilesCacheSafe();
        return Response.json({ path: target, bytes: body.content.length });
      }

      if (path === "/tools/read") {
        const body = (await request.json()) as { path: string };
        await this.ensure();
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

      if (path === "/tools/build") {
        return Response.json(await this.build());
      }

      if (path === "/preview/status") {
        // 只探测，不主动启动：iframe 请求本身会触发 ensure()
        const running = this.container.running;
        const ready = running ? await this.checkPreview() : false;
        return Response.json({ running, ready });
      }

      if (path === "/preview/start") {
        await this.ensure();
        await this.restartPreview();
        return Response.json({
          status: "ready",
          url: `/previews/${this.projectId}/`,
        });
      }

      if (path === "/snapshot") {
        await this.ensure();
        await this.takeSnapshot();
        return Response.json({ ok: true });
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
