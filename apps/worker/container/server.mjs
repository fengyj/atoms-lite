// Zero-dependency static preview server for generated sites.
// Serves /workspace on 0.0.0.0:8080. Node built-ins only.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const HOST = "0.0.0.0";
const PORT = 8080;
// boot.sh 会为 React 等项目设置 dist 目录；默认仍是静态站点的 /workspace。
const ROOT = resolve(process.env.PREVIEW_ROOT || "/workspace");
const INDEX = "index.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

// Resolve a URL pathname inside ROOT, or null when it escapes the root.
function toPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const target = resolve(ROOT, "." + decoded);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

async function readFileInfo(filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    return info;
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendFile(req, res, filePath, info, status = 200) {
  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const headOnly = req.method === "HEAD";

  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": info.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  if (headOnly) {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      send(res, 500, "500 Internal Server Error\n");
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "405 Method Not Allowed\n", { Allow: "GET, HEAD" });
      return;
    }

    let pathname;
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      send(res, 400, "400 Bad Request\n");
      return;
    }

    if (pathname === "/healthz") {
      send(res, 200, "ok\n", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    const filePath = toPath(pathname);
    if (!filePath) {
      send(res, 400, "400 Bad Request\n");
      return;
    }

    const direct = await readFileInfo(filePath);
    if (direct) {
      sendFile(req, res, filePath, direct);
      return;
    }

    // Directory requests (and extension-less routes) fall back to the SPA entry.
    const hasExtension = extname(pathname) !== "";
    const indexCandidate = hasExtension ? null : resolve(filePath, INDEX);
    if (indexCandidate && indexCandidate !== filePath) {
      const indexInfo = await readFileInfo(indexCandidate);
      if (indexInfo) {
        sendFile(req, res, indexCandidate, indexInfo);
        return;
      }
    }

    if (!hasExtension) {
      const rootIndex = resolve(ROOT, INDEX);
      const rootInfo = await readFileInfo(rootIndex);
      if (rootInfo) {
        sendFile(req, res, rootIndex, rootInfo);
        return;
      }
    }

    send(res, 404, "404 Not Found\n");
  } catch (error) {
    console.error("preview server error:", error);
    if (!res.headersSent) send(res, 500, "500 Internal Server Error\n");
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`preview server on ${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
