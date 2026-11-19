import { DurableObject } from "cloudflare:workers";
import { Files } from "@cloudflare/sandbox";
import {
  EXEC_MAX_OUTPUT_BYTES,
  EXEC_TIMEOUT_MS,
  SANDBOX_INACTIVITY_TIMEOUT_MS,
} from "@atoms-lite/contracts";
import type { Env } from "../env";
import type { ExecResult, FileEntry, VersionRow } from "./client";

const PREVIEW_PORT = 8080;
const WORKSPACE = "/workspace";
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
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO atoms_workspace (id, current_version_id) VALUES (?, NULL)",
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

  private async run(cmd: string[], cwd = WORKSPACE): Promise<ExecResult> {
    const proc = await this.container.exec(cmd, { cwd });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        proc.kill(9);
        reject(new Error(`command timeout: ${cmd.join(" ").slice(0, 80)}`));
      }, EXEC_TIMEOUT_MS);
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

  private async sh(script: string): Promise<ExecResult> {
    return this.run(["sh", "-c", script]);
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

    await this.sh(`mkdir -p ${WORKSPACE} && cp -r /opt/template/. ${WORKSPACE}/`);
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

    await this.sh(
      `cd ${WORKSPACE} && (pgrep -f '/opt/preview/server.mjs' >/dev/null || nohup node /opt/preview/server.mjs >/tmp/preview.log 2>&1 &)`,
    );

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await this.checkPreview()) return;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error("preview server did not become ready");
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
            entrypoint: ["node", "/opt/preview/server.mjs"],
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
            entrypoint: ["node", "/opt/preview/server.mjs"],
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
          entrypoint: ["node", "/opt/preview/server.mjs"],
          enableInternet: false,
        });
      }

      await container.setInactivityTimeout(SANDBOX_INACTIVITY_TIMEOUT_MS);
      await this.waitRunning();
    }

    await this.seed();
    await this.ensurePreview();
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

    return this.container.getTcpPort(PREVIEW_PORT).fetch(target.toString(), {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
    });
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

      if (path === "/meta") {
        // 只读 SQL，不启动容器：首页列表用
        const current = this.latestVersion();
        return Response.json({
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
        await this.ensure();
        return Response.json({ entries: await this.handleFiles() });
      }

      if (path === "/tools/write") {
        const body = (await request.json()) as { path: string; content: string };
        await this.ensure();
        const target = safePath(body.path);
        const dir = target.slice(0, target.lastIndexOf("/")) || WORKSPACE;
        await this.sh(`mkdir -p ${dir}`);
        const files = new Files(this.container);
        await files.writeFile(target, body.content);
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

      if (path === "/preview/status") {
        // 只探测，不主动启动：iframe 请求本身会触发 ensure()
        const running = this.container.running;
        const ready = running ? await this.checkPreview() : false;
        return Response.json({ running, ready });
      }

      if (path === "/preview/start") {
        await this.ensure();
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
