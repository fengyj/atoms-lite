import { createApp } from "./app.js";
import { createD1Db } from "./db-d1.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function contentType(pathname) {
  const index = pathname.lastIndexOf(".");
  const ext = index >= 0 ? pathname.slice(index).toLowerCase() : "";
  return MIME[ext] ?? "application/octet-stream";
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" || url.pathname.startsWith("/api/")) {
      return createApp(createD1Db(env.DB)).fetch(request, env, ctx);
    }

    const assets = globalThis.__ATOMS_ASSETS__ ?? {};
    const asset =
      assets[url.pathname] ??
      (!url.pathname.includes(".") ? assets["/index.html"] : null);
    if (!asset) return new Response("Not found", { status: 404 });

    return new Response(decodeBase64(asset.b), {
      headers: {
        "content-type": asset.t || contentType(url.pathname),
        "cache-control": "public, max-age=60",
      },
    });
  },
};
