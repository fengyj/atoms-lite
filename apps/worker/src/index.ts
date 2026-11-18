import { routeAgentRequest } from "agents";
import { ChatAgent } from "./agent";
import { Workspace } from "./workspace/do";
import type { Env } from "./env";

export { ChatAgent, Workspace };

const ALLOWED_ORIGINS = new Set([
  "https://atoms-lite.fengyj.me",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsFor(origin: string | null): Record<string, string> {
  return {
    "access-control-allow-origin":
      origin && ALLOWED_ORIGINS.has(origin)
        ? origin
        : "https://atoms-lite.fengyj.me",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function workspaceStub(env: Env): DurableObjectStub {
  return env.WORKSPACE.get(env.WORKSPACE.idFromName("demo"));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    // 浏览器跨站请求/WS 升级直接拒绝；同源与本地开发放行，curl 无 Origin 放行
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response("forbidden origin", { status: 403 });
    }

    const cors = corsFor(origin);

    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: cors });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname.startsWith("/agents/")) {
      const res = await routeAgentRequest(request, env);
      if (!res) return new Response("not found", { status: 404, headers: cors });
      if (res.status === 101) return res;
      return withCors(res, cors);
    }

    if (url.pathname.startsWith("/api/workspace")) {
      const target = new URL(request.url);
      target.pathname = url.pathname.replace(/^\/api\/workspace/, "") || "/";
      const res = await workspaceStub(env).fetch(
        new Request(target.toString(), request),
      );
      if (res.status === 101) return res;
      return withCors(res, cors);
    }

    if (url.pathname.startsWith("/previews/demo")) {
      return workspaceStub(env).fetch(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("not found", { status: 404, headers: cors });
  },
};
