// 用 Node 22 内置的 WebSocket 客户端验证 Upgrade 能否穿过 Worker 代理
const url = process.argv[2] ?? "ws://127.0.0.1:8798/previews/demo/ws";

const ws = new WebSocket(url);

const timer = setTimeout(() => {
  console.log("WS_RESULT=timeout");
  process.exit(2);
}, 8000);

ws.addEventListener("open", () => {
  ws.send("ping-through-worker");
});

ws.addEventListener("message", (event) => {
  clearTimeout(timer);
  console.log("WS_RESULT=ok:" + String(event.data));
  ws.close();
  process.exit(0);
});

ws.addEventListener("error", () => {
  clearTimeout(timer);
  console.log("WS_RESULT=error");
  process.exit(1);
});
