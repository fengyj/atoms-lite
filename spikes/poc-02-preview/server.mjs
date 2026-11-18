import http from "node:http";
import crypto from "node:crypto";

const PORT = 8080;

const htmlAbsolute = `<!doctype html>
<html><head><meta charset="utf-8"><title>poc-02</title></head>
<body>
<h1>preview ok</h1>
<p>absolute asset path</p>
<script src="/assets/app.js"></script>
</body></html>`;

const htmlRelative = `<!doctype html>
<html><head><meta charset="utf-8"><title>poc-02</title></head>
<body>
<h1>preview ok</h1>
<p>relative asset path</p>
<script src="./assets/app.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(htmlAbsolute);
    return;
  }

  if (url === "/relative") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(htmlRelative);
    return;
  }

  if (url === "/assets/app.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(`console.log("app.js loaded; path=" + location.pathname);`);
    return;
  }

  if (url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, seen: url, host: req.headers.host }));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found: " + url);
});

// 最小 WebSocket echo：只为验证 Upgrade 能否穿过 Worker 代理
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  socket.on("data", (buf) => {
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) {
      socket.end();
      return;
    }

    let length = buf[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      length = buf.readUInt16BE(2);
      offset = 4;
    }

    const mask = buf.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(buf.subarray(offset, offset + length));
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4];
    }

    // 回一个未掩码的文本帧
    const frame = Buffer.concat([
      Buffer.from([0x81, payload.length]),
      payload,
    ]);
    socket.write(frame);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`preview server on 0.0.0.0:${PORT}`);
});
