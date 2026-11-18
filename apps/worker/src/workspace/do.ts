import { DurableObject } from "cloudflare:workers";
import { Files } from "@cloudflare/sandbox";
import { SANDBOX_INACTIVITY_TIMEOUT_MS } from "@atoms-lite/contracts";
import type { Env } from "../env";
import type { ExecResult, FileEntry, VersionRow } from "./client";

const PREVIEW_PORT = 8080;
const WORKSPACE = "/workspace";
const ALLOWED_PROGRAMS = new Set([
  "ls",
  "cat",
  "find",
  "grep",
  "git",
  "node",
  "wc",
  "head",
  "tail",
  "sed",
  "mkdir",
  "cp",
  "mv",
  "test",
]);

const dec = (b?: ArrayBuffer | null) =>
  new TextDecoder().decode(b ?? new ArrayBuffer(0));

function safePath(path: string): string {
  if (!path.startsWith(`${WORKSPACE}/`) || path.includes("..")) {
    throw new Error(`path escape: ${path}`);
  }
  return path;
}

export class Workspace extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
  }

  private get container(): Container {
    const container = this.ctx.container;
    if (!container) throw new Error("container binding is not configured");
    return container;
  }

  private async run(cmd: string[], cwd = WORKSPACE): Promise<ExecResult> {
    const proc = await this.container.exec(cmd, { cwd });
    const out = await proc.output();
    return {
      stdout: dec(out.stdout),
      stderr: dec(out.stderr),
      exitCode: out.exitCode,
    };
  }

  private async sh(script: string): Promise<ExecResult> {
    return this.run(["sh", "-c", script]);
  }

  private snapshotId(): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ snapshot_id: string }>(
        "SELECT snapshot_id FROM atoms_snapshots WHERE project_id = 'demo'",
      )
      .toArray();
    return rows[0]?.snapshot_id ?? null;
  }

  private async waitRunning(deadlineMs = 60_000): Promise<void> {
    const deadline = Date.now() + deadlineMs;
    while (!this.container.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!this.container.running) throw new Error("container did not start");
  }

  private async seed(): Promise<void> {
    const hasIndex = await this.run(["test", "-f", `${WORKSPACE}/index.html`]);
    if (hasIndex.exitCode === 0) return;

    await this.sh(`mkdir -p ${WORKSPACE} && cp -r /opt/template/. ${WORKSPACE}/`);
    const hasGit = await this.run(["test", "-d", `${WORKSPACE}/.git`]);
    if (hasGit.exitCode !== 0) {
      await this.sh(
        `cd ${WORKSPACE} && git init -q && git config user.email atoms@local && git config user.name atoms-lite && git add -A && git commit -q -m template`,
      );
    }
  }

  private async checkPreview(): Promise<boolean> {
    try {
      const res = await this.container
        .getTcpPort(PREVIEW_PORT)
        .fetch(new Request("http://preview/"));
      return res.ok;
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
    const container = this.container;

    if (!container.running) {
      const snap = this.snapshotId();
      let started = false;

      if (snap) {
        try {
          container.start({
            containerSnapshot: { id: snap },
            entrypoint: ["node", "/opt/preview/server.mjs"],
            enableInternet: false,
          });
          started = true;
        } catch {
          started = false;
        }
      }

      if (!started) {
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
        `INSERT INTO atoms_snapshots (project_id, snapshot_id, created_at) VALUES ('demo', ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, created_at = excluded.created_at`,
        snap.id,
        Date.now(),
      );
    } catch {
      // 快照失败不影响主流程；下次会重新尝试
    }
  }

  private latestVersion(): VersionRow | null {
    const rows = this.ctx.storage.sql
      .exec<{
        id: string;
        git_commit: string;
        parent_id: string | null;
        summary: string;
        status: string;
        created_at: number;
      }>("SELECT * FROM atoms_versions ORDER BY created_at DESC LIMIT 1")
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
      .exec<{
        id: string;
        git_commit: string;
        parent_id: string | null;
        summary: string;
        status: string;
        created_at: number;
      }>("SELECT * FROM atoms_versions ORDER BY created_at ASC")
      .toArray();
    const latest = rows[rows.length - 1]?.id;
    return rows.map((r) => ({
      id: r.id,
      gitCommit: r.git_commit,
      parentId: r.parent_id,
      summary: r.summary,
      status: r.status,
      createdAt: r.created_at,
      current: r.id === latest,
    }));
  }

  private async createVersion(summary: string) {
    const files = new Files(this.container);
    await files.writeFile("/tmp/commit-msg", summary || "update");

    const out = await this.sh(
      `cd ${WORKSPACE} && git add -A && (git diff --cached --quiet || git commit -q -F /tmp/commit-msg) && git rev-parse HEAD`,
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

    await this.takeSnapshot();
    return { versionId: id, gitCommit };
  }

  private async checkout(versionId: string) {
    const rows = this.ctx.storage.sql
      .exec<{ git_commit: string }>(
        "SELECT git_commit FROM atoms_versions WHERE id = ?",
        versionId,
      )
      .toArray();
    const target = rows[0];
    if (!target) throw new Error(`version not found: ${versionId}`);

    const out = await this.sh(
      `cd ${WORKSPACE} && git checkout ${target.git_commit} -- .`,
    );
    if (out.exitCode !== 0) throw new Error(out.stderr || "checkout failed");

    return { ok: true, gitCommit: target.git_commit };
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

    const rest = url.pathname.replace(/^\/previews\/demo/, "") || "/";
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
      if (path.startsWith("/previews/demo")) {
        return await this.previewProxy(request);
      }

      if (path === "/ensure") {
        await this.ensure();
        return Response.json({ ok: true, running: this.container.running });
      }

      if (path === "/files") {
        await this.ensure();
        return Response.json({ entries: await this.handleFiles() });
      }

      if (path === "/tools/write") {
        const body = (await request.json()) as { path: string; content: string };
        const target = safePath(body.path);
        const dir = target.slice(0, target.lastIndexOf("/")) || WORKSPACE;
        await this.sh(`mkdir -p ${dir}`);
        const files = new Files(this.container);
        await files.writeFile(target, body.content);
        return Response.json({ path: target, bytes: body.content.length });
      }

      if (path === "/tools/read") {
        const body = (await request.json()) as { path: string };
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
        if (!ALLOWED_PROGRAMS.has(body.program)) {
          return Response.json(
            { error: `command not allowed: ${body.program}` },
            { status: 400 },
          );
        }
        const cwd =
          body.cwd && body.cwd.startsWith(WORKSPACE) ? body.cwd : WORKSPACE;
        const proc = await this.container.exec([body.program, ...(body.args ?? [])], {
          cwd,
        });

        const timer = new Promise<never>((_, reject) =>
          setTimeout(() => {
            proc.kill(9);
            reject(new Error("command timeout"));
          }, 60_000),
        );

        const out = await Promise.race([proc.output(), timer]);
        return Response.json({
          exitCode: out.exitCode,
          stdout: dec(out.stdout).slice(0, 128 * 1024),
          stderr: dec(out.stderr).slice(0, 32 * 1024),
        });
      }

      if (path === "/preview/start") {
        await this.ensure();
        return Response.json({ status: "ready", url: "/previews/demo/" });
      }

      if (path === "/snapshot") {
        await this.ensure();
        await this.takeSnapshot();
        return Response.json({ ok: true });
      }

      if (path === "/preview/stop") {
        return Response.json({ status: "stopped" });
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
      return Response.json(
        { error: String(error).slice(0, 500) },
        { status: 500 },
      );
    }
  }
}
