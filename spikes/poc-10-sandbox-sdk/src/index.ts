import { DurableObject } from "cloudflare:workers";
import { Agent } from "agents";
import { Files } from "@cloudflare/sandbox";

interface Env {
  PARENT: DurableObjectNamespace;
  CHILD: DurableObjectNamespace;
}

const dec = (b?: ArrayBuffer | null) =>
  new TextDecoder().decode(b ?? new ArrayBuffer(0)).trim();

async function run(container: Container, cmd: string[]) {
  const proc = await container.exec(cmd);
  const out = await proc.output();
  return {
    stdout: dec(out.stdout),
    stderr: dec(out.stderr),
    exitCode: out.exitCode,
  };
}

/**
 * 父对象：持有容器。
 */
export class Parent extends Agent<Env> {
  private async ensure() {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({
        image: container.images["base"],
        entrypoint: ["sleep", "infinity"],
        enableInternet: false,
      });
      await container.setInactivityTimeout(5 * 60_000);
    }
    const deadline = Date.now() + 30_000;
    while (!container.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return container;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/start") {
      const t0 = Date.now();
      const container = await this.ensure();
      const base = await run(container, ["cat", "/workspace/base.txt"]);
      return Response.json({
        ok: true,
        running: container.running,
        ms: Date.now() - t0,
        base: base.stdout,
      });
    }

    // #1 @cloudflare/sandbox 的 Files API
    if (url.pathname === "/files") {
      const container = await this.ensure();
      const files = new Files(container);
      const started = Date.now();

      await files.writeFile("/workspace/from-sdk.txt", "hello from Files\n");
      const res = await files.readFile("/workspace/from-sdk.txt");
      const text = await res.text();
      const stat = await files.stat("/workspace/from-sdk.txt");
      const dir = await files.readDirectory("/workspace");

      // 对照：原始 exec 读同一个文件
      const raw = await run(container, ["cat", "/workspace/from-sdk.txt"]);

      return Response.json({
        ok: true,
        ms: Date.now() - started,
        sdkText: text.trim(),
        rawText: raw.stdout,
        size: Number(stat.size),
        entries: dir.map((e) => e.name),
      });
    }

    // #2 子代理能否访问父容器
    if (url.pathname === "/child") {
      const container = await this.ensure();
      const before = await run(container, ["sh", "-c", "echo parent-written > /workspace/shared.txt"]);

      let childResult: unknown;
      let childError: string | null = null;
      try {
        const child = await this.subAgent(Child, "c1");
        childResult = await child.probe();
      } catch (error) {
        childError = String(error).slice(0, 300);
      }

      return Response.json({
        ok: true,
        parentWrite: before.exitCode,
        childResult,
        childError,
      });
    }

    if (url.pathname === "/snapshot") {
      const container = await this.ensure();
      const t0 = Date.now();
      const snap = await container.snapshotContainer({ name: "poc10" });
      return Response.json({
        ok: true,
        ms: Date.now() - t0,
        sizeMb: Math.round(snap.size / 1024 / 1024),
        id: snap.id,
      });
    }

    if (url.pathname === "/ping") {
      return new Response("parent ok");
    }

    return new Response("poc-10 parent", { status: 404 });
  }
}

/**
 * 子代理：只用来探测它能否访问父容器。
 */
export class Child extends Agent<Env> {
  async probe() {
    const container = (this.ctx as unknown as { container?: Container }).container;

    if (!container) {
      return { hasContainer: false };
    }

    let exec: string | null = null;
    let execError: string | null = null;
    try {
      const out = await run(container, ["sh", "-c", "cat /workspace/shared.txt 2>&1"]);
      exec = `${out.stdout} (exit=${out.exitCode})`;
    } catch (error) {
      execError = String(error).slice(0, 200);
    }

    return {
      hasContainer: true,
      running: container.running,
      exec,
      execError,
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.PARENT.idFromName("p1");
    return env.PARENT.get(id).fetch(request);
  },
};
