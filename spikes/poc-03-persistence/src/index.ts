import { DurableObject } from "cloudflare:workers";

interface Env {
  SANDBOX: DurableObjectNamespace;
  SNAPSHOTS: R2Bucket;
}

const dec = (b?: ArrayBuffer | null) =>
  new TextDecoder().decode(b ?? new ArrayBuffer(0)).trim();

const INSERT_DB = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/workspace/data/app.db');
db.exec('CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');
db.exec("INSERT INTO t(v) VALUES ('row-1')");
db.exec("INSERT INTO t(v) VALUES ('row-2')");
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log('rows=' + db.prepare('SELECT count(*) AS c FROM t').get().c);
`;

const COUNT_DB = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/workspace/data/app.db');
console.log('rows=' + db.prepare('SELECT count(*) AS c FROM t').get().c);
`;

export class Sandbox extends DurableObject<Env> {
  private async run(cmd: string[]) {
    const proc = await this.ctx.container.exec(cmd);
    const out = await proc.output();
    return {
      out: dec(out.stdout),
      err: dec(out.stderr),
      code: out.exitCode,
    };
  }

  private async waitRunning(deadlineMs = 30_000) {
    const deadline = Date.now() + deadlineMs;
    while (!this.ctx.container.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.ctx.container.running) throw new Error("container not running");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const container = this.ctx.container;

    if (url.pathname === "/run") {
      const t: Record<string, number> = {};
      const result: Record<string, unknown> = {};

      // 1. 冷启动
      const tStart = Date.now();
      if (!container.running) {
        container.start({
          image: container.images["base"],
          entrypoint: ["sleep", "infinity"],
          enableInternet: false,
        });
        await container.setInactivityTimeout(10 * 60_000);
      }
      await this.waitRunning();
      t.start = Date.now() - tStart;

      // 2. 写入文件 + SQLite
      const token = `tok-${Date.now()}`;
      await this.run(["sh", "-c", `echo ${token} > /workspace/state.txt`]);
      await this.run([
        "sh",
        "-c",
        `cat > /tmp/insert.cjs <<'EOF'\n${INSERT_DB}\nEOF\nnode --experimental-sqlite /tmp/insert.cjs`,
      ]);
      result.token = token;
      result.dbBefore = (
        await this.run([
          "sh",
          "-c",
          `cat > /tmp/count.cjs <<'EOF'\n${COUNT_DB}\nEOF\nnode --experimental-sqlite /tmp/count.cjs`,
        ])
      ).out;

      // 3. 快照
      const tSnap = Date.now();
      let snapshot: { id: string; size: number } | null = null;
      let snapshotError: string | null = null;
      try {
        const snap = await container.snapshotContainer({ name: "poc03" });
        snapshot = { id: snap.id, size: snap.size };
      } catch (error) {
        snapshotError = String(error);
      }
      t.snapshot = Date.now() - tSnap;

      // 4. 销毁
      const tDestroy = Date.now();
      await container.destroy();
      t.destroy = Date.now() - tDestroy;
      result.runningAfterDestroy = container.running;

      // 5. 从快照恢复（仅当快照成功）
      if (snapshot) {
        const tRestore = Date.now();
        container.start({
          containerSnapshot: { id: snapshot.id },
          entrypoint: ["sleep", "infinity"],
          enableInternet: false,
        });
        await container.setInactivityTimeout(10 * 60_000);
        await this.waitRunning();
        t.restore = Date.now() - tRestore;

        const state = await this.run(["cat", "/workspace/state.txt"]);
        const db = await this.run([
          "sh",
          "-c",
          `cat > /tmp/count.cjs <<'EOF'\n${COUNT_DB}\nEOF\nnode --experimental-sqlite /tmp/count.cjs`,
        ]);
        result.stateAfter = state.out;
        result.dbAfter = db.out;
        result.restored = state.out === token;
      }

      return Response.json({ snapshot, snapshotError, timings: t, ...result });
    }

    if (url.pathname === "/snapshot") {
      const t0 = Date.now();
      if (!container.running) {
        container.start({
          image: container.images["base"],
          entrypoint: ["sleep", "infinity"],
          enableInternet: false,
        });
        await container.setInactivityTimeout(10 * 60_000);
        await this.waitRunning();
      }

      const token = `tok-${Date.now()}`;
      await this.run(["sh", "-c", `echo ${token} > /workspace/state.txt`]);
      await this.run([
        "sh",
        "-c",
        `cat > /tmp/insert.cjs <<'EOF'\n${INSERT_DB}\nEOF\nnode --experimental-sqlite /tmp/insert.cjs`,
      ]);

      const snap = await container.snapshotContainer({ name: "poc03" });
      await this.ctx.storage.put("snapshotId", snap.id);

      return Response.json({
        ok: true,
        token,
        snapshotId: snap.id,
        size: snap.size,
        ms: Date.now() - t0,
      });
    }

    if (url.pathname === "/restore") {
      const snapshotId = await this.ctx.storage.get<string>("snapshotId");
      if (!snapshotId) {
        return Response.json({ ok: false, error: "no snapshotId in DO storage" }, { status: 404 });
      }

      const t0 = Date.now();
      if (container.running) {
        await container.destroy();
      }

      container.start({
        containerSnapshot: { id: snapshotId },
        entrypoint: ["sleep", "infinity"],
        enableInternet: false,
      });
      await container.setInactivityTimeout(10 * 60_000);
      await this.waitRunning();

      const state = await this.run(["cat", "/workspace/state.txt"]);
      const db = await this.run([
        "sh",
        "-c",
        `cat > /tmp/count.cjs <<'EOF'\n${COUNT_DB}\nEOF\nnode --experimental-sqlite /tmp/count.cjs`,
      ]);

      return Response.json({
        ok: true,
        snapshotId,
        state: state.out,
        db: db.out,
        ms: Date.now() - t0,
      });
    }

    if (url.pathname === "/forget") {
      await this.ctx.storage.delete("snapshotId");
      await container.destroy();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/status") {
      return Response.json({ running: container.running });
    }

    return new Response("poc-03: POST /run", { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.SANDBOX.idFromName("poc03");
    return env.SANDBOX.get(id).fetch(request);
  },
};
