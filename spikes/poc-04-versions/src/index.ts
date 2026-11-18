import { DurableObject } from "cloudflare:workers";

interface Env {
  SANDBOX: DurableObjectNamespace;
}

const dec = (b?: ArrayBuffer | null) =>
  new TextDecoder().decode(b ?? new ArrayBuffer(0)).trim();

type VersionRow = {
  id: string;
  git_commit: string;
  parent_id: string | null;
  summary: string;
  status: string;
  created_at: number;
};

export class Sandbox extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        git_commit TEXT NOT NULL,
        parent_id TEXT,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  private async run(cmd: string[]) {
    const proc = await this.ctx.container.exec(cmd);
    const out = await proc.output();
    return {
      out: dec(out.stdout),
      err: dec(out.stderr),
      code: out.exitCode,
    };
  }

  private async sh(script: string) {
    return this.run(["sh", "-c", script]);
  }

  private async ensure() {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({
        image: container.images["base"],
        entrypoint: ["sleep", "infinity"],
        enableInternet: false,
      });
      await container.setInactivityTimeout(10 * 60_000);
    }
    const deadline = Date.now() + 30_000;
    while (!container.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!container.running) throw new Error("container not running");
  }

  private nextVersionId(): string {
    const row = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM versions")
      .one();
    return `ver_${row.n + 1}`;
  }

  private insertVersion(
    id: string,
    gitCommit: string,
    parentId: string | null,
    summary: string,
  ): VersionRow {
    const createdAt = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO versions (id, git_commit, parent_id, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      gitCommit,
      parentId,
      summary,
      "draft",
      createdAt,
    );
    return {
      id,
      git_commit: gitCommit,
      parent_id: parentId,
      summary,
      status: "draft",
      created_at: createdAt,
    };
  }

  private latestVersion(): VersionRow | null {
    const rows = this.ctx.storage.sql
      .exec<VersionRow>("SELECT * FROM versions ORDER BY created_at DESC LIMIT 1")
      .toArray();
    return rows[0] ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      await this.ensure();
      await this.sh(
        "cd /workspace && git init -q 2>/dev/null || true; " +
          "printf 'data/\\n' > .gitignore; mkdir -p data; printf 'hello v1\\n' > app.txt; " +
          "printf 'keep-me\\n' > data/state.txt; " +
          "git add -A && git commit -q -m init && git rev-parse HEAD",
      );
      const head = await this.sh("cd /workspace && git rev-parse HEAD");
      const v = this.insertVersion(
        this.nextVersionId(),
        head.out,
        null,
        "初始版本",
      );
      return Response.json({ ok: true, version: v });
    }

    if (url.pathname === "/change") {
      await this.ensure();
      const head = await this.sh(
        "cd /workspace && printf 'hello v2\\n' > app.txt && git add -A && git commit -q -m change && git rev-parse HEAD",
      );
      const latest = this.latestVersion();
      const v = this.insertVersion(
        this.nextVersionId(),
        head.out,
        latest?.id ?? null,
        "修改文案",
      );
      return Response.json({ ok: true, version: v });
    }

    if (url.pathname === "/versions") {
      const t0 = Date.now();
      const rows = this.ctx.storage.sql
        .exec<VersionRow>("SELECT * FROM versions ORDER BY created_at ASC")
        .toArray();
      return Response.json({
        ok: true,
        versionCount: rows.length,
        queryMs: Date.now() - t0,
        containerRunning: this.ctx.container.running, // 只读属性，不触发启动
        versions: rows,
      });
    }

    if (url.pathname === "/rollback") {
      await this.ensure();
      const id = url.searchParams.get("id");
      const target = this.ctx.storage.sql
        .exec<VersionRow>("SELECT * FROM versions WHERE id = ?", id)
        .toArray()[0];
      if (!target) return Response.json({ ok: false, error: "version not found" }, { status: 404 });

      const before = await this.sh("cd /workspace && cat app.txt && wc -l < data/state.txt");
      // 只恢复文件内容，不做 reset；回滚也产生新提交
      const out = await this.sh(
        `cd /workspace && git checkout ${target.git_commit} -- . && git add -A && git commit -q -m "rollback to ${target.id}" && git rev-parse HEAD`,
      );
      const after = await this.sh("cd /workspace && cat app.txt && wc -l < data/state.txt");
      const latest = this.latestVersion();
      const v = this.insertVersion(
        this.nextVersionId(),
        out.out,
        latest?.id ?? null,
        `回滚到 ${target.id}`,
      );

      return Response.json({
        ok: true,
        target: target.id,
        newVersion: v,
        fileBefore: before.out,
        fileAfter: after.out,
      });
    }

    if (url.pathname === "/continue") {
      await this.ensure();
      const id = url.searchParams.get("id");
      const target = this.ctx.storage.sql
        .exec<VersionRow>("SELECT * FROM versions WHERE id = ?", id)
        .toArray()[0];
      if (!target) return Response.json({ ok: false, error: "version not found" }, { status: 404 });

      // 从旧版本分叉：新提交的 parent 是旧版本
      const out = await this.sh(
        `cd /workspace && git switch -q --detach ${target.git_commit} && printf 'from ${target.id}\\n' > fork.txt && git add -A && git commit -q -m "fork from ${target.id}" && git rev-parse HEAD && git rev-parse HEAD^`,
      );
      const lines = out.out.split("\n");
      const newCommit = lines[0] ?? "";
      const parentCommit = lines[1] ?? "";

      const v = this.insertVersion(
        this.nextVersionId(),
        newCommit,
        target.id,
        `从 ${target.id} 继续`,
      );

      const log = await this.sh("cd /workspace && git log --all --oneline");

      return Response.json({
        ok: true,
        newVersion: v,
        parentCommitMatches: parentCommit === target.git_commit,
        historyPreserved: log.out.split("\n").length,
        log: log.out,
      });
    }

    if (url.pathname === "/destroy") {
      await this.ctx.container.destroy();
      return Response.json({ ok: true, running: this.ctx.container.running });
    }

    if (url.pathname === "/snapshot-size") {
      await this.ensure();
      const mb = Number(url.searchParams.get("mb") ?? "200");
      const files = Number(url.searchParams.get("files") ?? "200");

      const tWrite = Date.now();
      await this.sh(
        `mkdir -p /workspace/big && for i in $(seq 1 ${files}); do dd if=/dev/urandom of=/workspace/big/f$i.bin bs=1M count=$(( ${mb} / ${files} )) status=none; done`,
      );
      const writeMs = Date.now() - tWrite;

      const tSnap = Date.now();
      const snap = await this.ctx.container.snapshotContainer({ name: "poc04" });
      const snapshotMs = Date.now() - tSnap;

      return Response.json({
        ok: true,
        addedMb: mb,
        addedFiles: files,
        writeMs,
        snapshotMs,
        sizeBytes: snap.size,
        sizeMb: Math.round(snap.size / 1024 / 1024),
      });
    }

    if (url.pathname === "/head") {
      await this.ensure();
      const log = await this.sh("cd /workspace && git log --all --oneline && echo '---' && cat app.txt && echo '---' && cat data/state.txt");
      return Response.json({ ok: true, out: log.out });
    }

    return new Response("poc-04", { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.SANDBOX.idFromName("poc04");
    return env.SANDBOX.get(id).fetch(request);
  },
};
