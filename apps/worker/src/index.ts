import { routeAgentRequest } from "agents";
import { ChatAgent } from "./agent";
import { Workspace } from "./workspace/do";
import type { Env } from "./env";

export { ChatAgent, Workspace };

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function workspaceStub(env: Env): DurableObjectStub {
  return env.WORKSPACE.get(env.WORKSPACE.idFromName("demo"));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: CORS });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname.startsWith("/agents/")) {
      const res = await routeAgentRequest(request, env);
      if (!res) return new Response("not found", { status: 404, headers: CORS });
      if (res.status === 101) return res;
      return withCors(res);
    }

    if (url.pathname.startsWith("/api/workspace")) {
      const target = new URL(request.url);
      target.pathname = url.pathname.replace(/^\/api\/workspace/, "") || "/";
      const res = await workspaceStub(env).fetch(
        new Request(target.toString(), request),
      );
      if (res.status === 101) return res;
      return withCors(res);
    }

    if (url.pathname.startsWith("/previews/demo")) {
      return workspaceStub(env).fetch(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
};
