import { DurableObject } from "cloudflare:workers";

export class Sandbox extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const container = this.ctx.container;

    if (url.pathname === "/start") {
      const t0 = Date.now();
      const before = container.running;

      container.start({
        image: container.images["base"],
        entrypoint: ["sleep", "infinity"],
        enableInternet: false,
      });

      let info: unknown = null;
      try {
        info = await container.inspect();
      } catch (error) {
        info = { inspectError: String(error) };
      }

      // 等容器真正可执行（最多 30s）
      let attempts = 0;
      let lastError: string | null = null;
      while (Date.now() - t0 < 30_000) {
        attempts += 1;
        try {
          const proc = await container.exec(["uname", "-a"]);
          const out = await proc.output();
          const file = await container.exec(["cat", "/workspace/poc.txt"]);
          const fileOut = await file.output();
          return Response.json({
            ok: true,
            before,
            running: container.running,
            startedInMs: Date.now() - t0,
            attempts,
            uname: new TextDecoder().decode(out.stdout).trim(),
            exitCode: out.exitCode,
            pocText: new TextDecoder().decode(fileOut.stdout).trim(),
            info,
          });
        } catch (error) {
          lastError = String(error);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      return Response.json(
        {
          ok: false,
          before,
          running: container.running,
          attempts,
          lastError,
          info,
        },
        { status: 503 },
      );
    }

    return Response.json({ running: container.running, hint: "POST /start" });
  }
}

export default {
  async fetch(request: Request, env: { SANDBOX: DurableObjectNamespace }): Promise<Response> {
    const id = env.SANDBOX.idFromName("gate");
    return env.SANDBOX.get(id).fetch(request);
  },
};
