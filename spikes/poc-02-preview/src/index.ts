import { DurableObject } from "cloudflare:workers";

const PREFIX = "/previews/demo";
const PORT = 8080;

export class Sandbox extends DurableObject {
  private async ensureRunning(): Promise<void> {
    const container = this.ctx.container;

    if (!container.running) {
      container.start({
        image: container.images["base"],
        entrypoint: ["node", "/app/server.mjs"],
        enableInternet: false,
      });
      await container.setInactivityTimeout(5 * 60_000);
    }

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const res = await container
          .getTcpPort(PORT)
          .fetch(new Request(`http://sandbox/health`));
        if (res.ok) return;
      } catch {
        // 端口还没起来
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error("preview server did not become ready in 30s");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const container = this.ctx.container;

    if (url.pathname === "/start") {
      await this.ensureRunning();
      return Response.json({ ok: true, running: container.running });
    }

    if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) {
      await this.ensureRunning();

      const isUpgrade =
        request.headers.get("upgrade")?.toLowerCase() === "websocket";

      // WebSocket：原样转发，Worker 返回 101
      if (isUpgrade) {
        return container.getTcpPort(PORT).fetch(request);
      }

      const rest = url.pathname.slice(PREFIX.length) || "/";
      const target = new URL(request.url);
      target.pathname = rest;
      const proxied = new Request(target.toString(), request);
      return container.getTcpPort(PORT).fetch(proxied);
    }

    return new Response("not found (worker)", { status: 404 });
  }
}

export default {
  async fetch(
    request: Request,
    env: { SANDBOX: DurableObjectNamespace },
  ): Promise<Response> {
    const id = env.SANDBOX.idFromName("gate");
    return env.SANDBOX.get(id).fetch(request);
  },
};
