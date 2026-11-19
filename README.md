# atoms-lite

对话式应用生成平台 —— 面试笔试 Demo。

当前状态：**v1 可用**。首页工作台输入需求（如五子棋、待办清单、个人网站）即可创建独立项目，生成可运行的多文件网站，支持预览与版本。

线上：https://atoms-lite.fengyj.me

页面：

- `/` 首页工作台（需求输入、示例、项目概况、最近项目）
- `/sessions/:projectId` 会话工作区（对话 / 预览 / Sandbox / 版本）
- 每个项目有独立容器、文件、git 历史、版本和 Agent 会话

- 实现记录：`docs/implementation.md`
- 系统架构：`docs/architecture/system-architecture.md`
- 数据模型：`docs/architecture/data-model.md`
- 验证记录：`docs/poc/`
- 实现决策：`docs/decisions/`（与设计文档冲突时以此为准）

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
  web/          Next.js 前端（首页工作台 + 会话工作区 + /design gallery）
  worker/       Cloudflare Worker（ChatAgent + WorkspaceDO + 容器沙箱）
packages/
  contracts/    共享契约（待实现）
docs/
  poc/          PoC 的假设、过程、结论
  decisions/    已定的实现决策（ADR）
  *.md          需求设计与竞品分析
spikes/         一次性验证代码（不属于 workspace）
```

依赖方向：`web → contracts ← worker`。两个 app 之间没有代码依赖，只通过 contracts 交换数据。

## 本地启动

要求 Node >= 22（仅用于本机构建，部署产物跑在 workerd 上）。

```bash
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # 填 MODEL_*

# 两个终端
pnpm dev:worker    # :8787
NEXT_PUBLIC_WORKER_HOST=http://localhost:8787 pnpm dev:web   # :3000
```

生产部署：

```bash
NEXT_PUBLIC_WORKER_HOST= pnpm --filter @atoms-lite/web build
cd apps/worker
wrangler secret put MODEL_API_KEY -c wrangler.prod.jsonc
wrangler deploy -c wrangler.prod.jsonc
```

其它：

```bash
pnpm typecheck    # 三个包全部检查（web 会先跑 next typegen）
pnpm build
```

## 已就绪

- [x] pnpm workspace、共享 tsconfig、锁文件
- [x] Next.js + Tailwind v4 可启动
- [x] 设计 token + 三栏工作台 shell + 组件 gallery（`/design`）
- [x] AI Elements 组件接入（含本地化、shiki 按需高亮）
- [x] 容器启停、预览 HTTP/WS 代理、快照恢复、版本回滚（PoC 验证）
- [x] AIChatAgent 会话、停止、续传、多会话隔离、工具与审批（PoC 验证）
- [x] 运行事件表与时间线（PoC 验证）
- [x] **单角色生成闭环**：需求 → 工具写文件 → 预览 → 版本
- [x] **首页 + 会话页**：首页提交需求后进入工作区并自动发送
- [x] **多项目**：每次需求创建独立项目，项目之间互不影响
- [x] 生产部署（`atoms-lite.fengyj.me`，静态资源 + Worker + Container）

## 未实现（按计划推进）

- [ ] 版本回滚 UI / 导出 / 产物
- [ ] 附件与 R2
- [ ] D1 项目/会话元数据
- [ ] 多角色（v1 不做，接口预留）
- [ ] 访问门禁与预算上限

## 已知约束

- 本机已安装 Docker（29.1.3），手动启动（不开机自启）；`wrangler dev` 走本地 Docker，不需要 Workers Paid。
- Ubuntu 的 `docker.io` 不含 buildx，已单独放到 `~/.docker/cli-plugins/docker-buildx`。
- Docker Hub 直连不通，已在 `/etc/docker/daemon.json` 配置 `docker.m.daocloud.io` 镜像站。
- 容器实例需要显式 `setInactivityTimeout()`，否则两次请求之间会被回收（详见 POC-00 文档）。
- `apps/web/AGENTS.md` 是 Next 16 自动生成的，可用 `agentRules: false` 关闭。
- 契约包通过 `exports` 直接暴露 `.ts` 源码，不设构建步骤。
- Playwright 1.63.0 对应本机缓存的 chromium-1243；升级会触发浏览器下载。
- 清理 dev 进程请按端口（`lsof -t -i:3000`），不要按名字模糊匹配（会杀掉 Next 的 postcss worker）。
