# POC-00 本地容器闸门（spike）

删除：`rm -rf spikes/poc-00-container-gate`

## 目的

验证 `wrangler dev` 能否用 Podman 的 Docker 兼容 socket 启动 Containers。

## 运行

```bash
cd spikes/poc-00-container-gate
pnpm install

export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
pnpm dev            # :8799

curl -s localhost:8799/ | jq
curl -s -X POST localhost:8799/start | jq
```

## 期望

- `wrangler dev` 不要求 Cloudflare 登录 / 付费
- `/start` 返回 `running: true`、`uname` 输出、`pocText: atoms-lite poc-00`
- `startedInMs` < 60000

## 失败时看什么

- wrangler 是否报 Docker API 不支持
- `podman events` 是否有 build/run
- `podman ps` 是否能看到容器
