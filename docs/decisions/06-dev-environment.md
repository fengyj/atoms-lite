# 06 本地开发环境

状态：**已定**（2026-11-18）

## 1. 容器

- Docker Engine 29.1.3，**手动启动**（`sudo systemctl start docker`），不开机自启。
- Ubuntu 的 `docker.io` **不含 buildx**，已放到 `~/.docker/cli-plugins/docker-buildx`。
  缺了会回退 legacy builder，报 `unknown flag: --provenance`。
- Docker Hub 直连不通，`/etc/docker/daemon.json` 配了 `docker.m.daocloud.io` 镜像站。
- `wrangler dev` 走本地 Docker，**不需要 Workers Paid**。
- Rootless Podman 不可行：egress sidecar 需要 `NET_ADMIN`/`NET_RAW`，且启动即退出。
  记录见 `docs/poc/poc-00-container-gate.md`。

## 2. Next 16 的跨源限制

Playwright / 本地工具常用 `127.0.0.1`，而页面在 `localhost`，Next 16 默认拦截跨源 dev 资源，
后果是**客户端 JS 不加载、页面不 hydration、点击没反应**。

```ts
// apps/web/next.config.ts
allowedDevOrigins: ["127.0.0.1", "localhost"]
```

## 3. Worker 的 CORS 必须回显 Origin

`localhost:3000` 和 `127.0.0.1:3000` 是两个 origin。写死一个会让另一个的
`get-messages` 失败，`useAgentChat` 抛错、页面白屏。

```ts
const allowed = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const origin = request.headers.get("origin") ?? "";
"access-control-allow-origin": allowed.has(origin) ? origin : "http://localhost:3000"
```

## 4. 会话名要放进 URL

`useAgentChat` 的状态在内存里，刷新会回到默认会话，表现像"消息丢了"。
临时页面用 `?s=<name>`；正式产品用 `/sessions/:id`。

## 5. 清进程：按端口，不要按名字

踩过的坑：用 `awk '/next/ {kill}'` 清理进程，会命中 Next 的 postcss worker
（路径 `apps/web/.next/dev/build/...`），导致：

```
postcss subprocess crashed ... signal: 9 (SIGKILL) → HTTP 500
```

正确做法：

```bash
for p in 3000 8796; do lsof -t -i:$p | xargs -r kill -9; done
ps -eo pid,comm | awk '$2 ~ /^next-server/ {print $1}' | xargs -r kill -9
ps -eo pid,comm | awk '$2 ~ /^downloaded-@clo/ {print $1}' | xargs -r kill -9
```

同时只保留一个 web + 一个 worker。WSL2 下内存有限，多套 dev server 会互相拖慢。

## 6. 探活超时

`/poc-chat` 首次编译约 3s。用 `curl -m 3` 会得到 `000`，误判为服务没起来。
探活用 `-m 10` 以上；Playwright 用 `waitUntil: "domcontentloaded"`。

## 7. Playwright

- `playwright@1.63.0` 对应本机缓存的 `chromium-1243`，无需下载浏览器。
- 1.64/1.65 分别需要 1248/1255，会触发下载。
- 脚本：`scripts/poc01-shots.mjs`（截图）、`scripts/poc06.mjs`、`scripts/poc08.mjs`。

## 8. 域名

- `*.workers.dev` 在本机被 DNS 污染（解析到 Meta IP），无法访问。
- 生产验证统一使用自定义域名：`atoms-lite.fengyj.me`（Cloudflare 托管 zone）。
- 部署时通过 `wrangler.jsonc` 的 `routes: [{ pattern, custom_domain: true }]` 自动创建 DNS 与证书。

## 9. 依赖版本约束

见 `docs/decisions/01-scope-and-architecture.md`。
`agents` / `@cloudflare/ai-chat` / `ai` / `@ai-sdk/react` 之间存在 peer 约束，
**演示前不要升级**，并保持 `pnpm why ai` 只有一份。
