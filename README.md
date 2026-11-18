# atoms-lite

对话式应用生成平台 —— 面试笔试 Demo。

当前状态：**只有骨架，没有任何业务代码**。

## 技术选型（Phase 1）

| 层 | 选型 | 版本 |
|---|---|---|
| Web | Next.js + React + Tailwind | 16.4.6 / 19.3.1 / 4.3.5 |
| Chat 传输 | `@cloudflare/ai-chat` | 0.12.2 |
| Agent 运行时 | `agents`（Cloudflare Agents SDK） | 0.33.0 |
| 模型接入 | AI SDK（OpenAI 兼容端点） | 7.0.176 |
| 语言 | TypeScript | 6.0.3 |
| 构建 / 本地运行时 | Wrangler（workerd） | 4.164.0 |

版本是刻意锁定的：`agents` 与 `@cloudflare/ai-chat` 都处于 0.x，`ai` 7 刚稳定。
四者的 peer 约束已核对通过，**演示前不要升级**。

## 目录

```
apps/
  web/          Next.js 前端（空白页）
  worker/       Cloudflare Worker（占位入口）
packages/
  contracts/    共享契约（当前为空）
docs/           需求设计与竞品分析
```

依赖方向：`web → contracts ← worker`。两个 app 之间没有代码依赖，只通过 contracts 交换数据。

## 本地启动

要求 Node >= 22（仅用于本机构建，部署产物跑在 workerd 上）。

```bash
pnpm install
pnpm dev          # web :3000 + worker :8787
```

单独启动：

```bash
pnpm dev:web
pnpm dev:worker
```

其它：

```bash
pnpm typecheck    # 三个包全部检查（web 会先跑 next typegen）
pnpm build
```

## 已就绪

- [x] pnpm workspace、共享 tsconfig、锁文件
- [x] Next.js + Tailwind v4 可启动（`/` 返回 200）
- [x] Wrangler 可启动（`/` 返回占位文本）
- [x] TypeScript 6 全量类型检查通过
- [x] 设计 token + 工作台三栏 shell + 组件 gallery（`/design`）
- [x] AI Elements 组件接入（假数据）

## 未实现（按计划推进）

- [ ] 契约（实体 / 事件 / 工具名）
- [ ] `AIChatAgent` + Durable Object 绑定
- [ ] 前端聊天界面 + AI Elements
- [ ] 工具集（文件 / 命令 / 预览）
- [ ] Sandbox
- [ ] 版本与产物
- [ ] 多角色（Phase 1 明确不做）

## 已知约束

- 本机已安装 Docker（29.1.3），手动启动（不开机自启）；`wrangler dev` 走本地 Docker，不需要 Workers Paid。
- Ubuntu 的 `docker.io` 不含 buildx，已单独放到 `~/.docker/cli-plugins/docker-buildx`。
- Docker Hub 直连不通，已在 `/etc/docker/daemon.json` 配置 `docker.m.daocloud.io` 镜像站。
- 容器实例需要显式 `setInactivityTimeout()`，否则两次请求之间会被回收（详见 POC-00 文档）。
- `apps/web/AGENTS.md` 是 Next 16 自动生成的，可用 `agentRules: false` 关闭。
- 契约包通过 `exports` 直接暴露 `.ts` 源码，不设构建步骤。
