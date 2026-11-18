import { DurableObject } from "cloudflare:workers";

export class Sandbox extends DurableObject {
  private async run(cmd: string[]) {
    const container = this.ctx.container;
    const proc = await container.exec(cmd);
    const out = await proc.output();
    return {
      stdout: new TextDecoder().decode(out.stdout ?? new ArrayBuffer(0)).trim(),
      code: out.exitCode,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const container = this.ctx.container;

    if (url.pathname === "/start") {
      const t0 = Date.now();
      const before = container.running;

      if (!container.running) {
        container.start({
          image: container.images["base"],
          entrypoint: ["sleep", "infinity"],
          enableInternet: false,
        });

        // 本地默认很快回收实例；显式给 5 分钟空闲窗口
        await container.setInactivityTimeout(5 * 60_000);
      }

      let attempts = 0;
      let lastError: string | null = null;

      while (Date.now() - t0 < 30_000) {
        attempts += 1;
        try {
          const host = await this.run(["hostname"]);
          await this.run([
            "sh",
            "-c",
            "[ -f /workspace/state.txt ] || echo persisted-at-$(date +%s) > /workspace/state.txt",
          ]);
          const state = await this.run(["cat", "/workspace/state.txt"]);

          return Response.json({
            ok: true,
            before,
            running: container.running,
            startedInMs: Date.now() - t0,
            attempts,
            hostname: host.stdout,
            stateText: state.stdout,
            image: container.images["base"],
          });
        } catch (error) {
          lastError = String(error);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      return Response.json({ ok: false, before, attempts, lastError }, { status: 503 });
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
