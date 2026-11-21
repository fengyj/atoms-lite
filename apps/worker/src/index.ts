import { routeAgentRequest } from "agents";
import { ChatAgent } from "./agent";
import { Projects } from "./projects";
import { Workspace } from "./workspace/do";
import type { Env } from "./env";

export { ChatAgent, Projects, Workspace };

const ALLOWED_ORIGINS = new Set([
  "https://atoms-lite.fengyj.me",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // 本地预览 iframe 的源（生产同源，不需要）
  "http://localhost:8787",
  "http://127.0.0.1:8787",
]);

function corsFor(origin: string | null): Record<string, string> {
  return {
    "access-control-allow-origin":
      origin && ALLOWED_ORIGINS.has(origin)
        ? origin
        : "https://atoms-lite.fengyj.me",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function workspaceStub(env: Env, projectId: string): DurableObjectStub {
  return env.WORKSPACE.get(env.WORKSPACE.idFromName(projectId));
}

function projectsStub(env: Env): DurableObjectStub {
  return env.PROJECTS.get(env.PROJECTS.idFromName("registry"));
}

async function proxyTo(
  stub: DurableObjectStub,
  request: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const target = new URL(url);
  target.pathname = path;
  return stub.fetch(new Request(target.toString(), request));
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

    // 项目索引：GET/POST /api/projects，GET /api/projects/:id
    if (url.pathname === "/api/projects") {
      const res = await proxyTo(projectsStub(env), request, "/projects", url);
      return withCors(res, cors);
    }

    if (
      (url.pathname === "/api/usage/status" ||
        url.pathname === "/api/usage/daily") &&
      request.method === "GET"
    ) {
      const res = await proxyTo(
        projectsStub(env),
        request,
        url.pathname.replace(/^\/api/, ""),
        url,
      );
      return withCors(res, cors);
    }

    if (url.pathname.startsWith("/api/projects/")) {
      const rest = url.pathname.replace(/^\/api\/projects\//, "");
      const [projectId, ...tail] = rest.split("/");

      if (projectId && tail.length === 0) {
        const res = await proxyTo(
          projectsStub(env),
          request,
          `/projects/${projectId}`,
          url,
        );
        return withCors(res, cors);
      }

      if (
        projectId &&
        tail.length === 2 &&
        tail[0] === "runtime" &&
        tail[1] === "switch"
      ) {
        const res = await proxyTo(
          projectsStub(env),
          request,
          `/projects/${projectId}/runtime/switch`,
          url,
        );
        return withCors(res, cors);
      }

      if (projectId && tail.length === 1 && tail[0] === "configure") {
        const res = await proxyTo(
          projectsStub(env),
          request,
          `/projects/${projectId}/configure`,
          url,
        );
        return withCors(res, cors);
      }

      if (projectId && tail.length === 1 && tail[0] === "usage") {
        const res = await proxyTo(
          projectsStub(env),
          request,
          `/projects/${projectId}/usage`,
          url,
        );
        return withCors(res, cors);
      }

      if (projectId && tail.length > 0) {
        const res = await proxyTo(
          workspaceStub(env, projectId),
          request,
          `/${tail.join("/")}`,
          url,
        );
        return withCors(res, cors);
      }
    }

    // 兼容 v1 的固定 demo 端点
    if (url.pathname.startsWith("/api/workspace")) {
      const target = url.pathname.replace(/^\/api\/workspace/, "") || "/";
      const res = await proxyTo(workspaceStub(env, "demo"), request, target, url);
      return withCors(res, cors);
    }

    const preview = url.pathname.match(/^\/previews\/([^/]+)(?:\/|$)/);
    if (preview?.[1]) {
      return workspaceStub(env, preview[1]).fetch(request);
    }

    // 静态导出只有一个会话壳；其它项目 ID 复用 shell，前端从 pathname 读取
    const session = url.pathname.match(/^\/sessions\/([A-Za-z0-9_-]+)\/?$/);
    if (session && env.ASSETS) {
      const shell = new URL("/sessions/demo.html", url);
      shell.search = url.search;
      const res = await env.ASSETS.fetch(
        new Request(shell.toString(), { headers: request.headers }),
      );
      if (res.status !== 404) return res;
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("not found", { status: 404, headers: cors });
  },
};
