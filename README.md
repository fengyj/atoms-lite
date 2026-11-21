# atoms-lite

对话式应用生成平台 —— 面试笔试 Demo。

当前状态：**v1 可演示（A/B/C 完成）**。首页工作台输入需求即可创建独立项目，并按需求自动选择模板：

- Static：多文件静态站点，**browser runtime**（DO SQLite + esm.sh importmap，无容器）
- React：React + TypeScript + Vite + Tailwind + shadcn/ui + HashRouter（容器）
- Full-stack：React 前端 + Hono API + SQLite（容器）

线上：https://atoms-lite.fengyj.me

页面：

- `/` 首页工作台（需求输入、技术栈自动选型、示例、最近项目）
- `/sessions/:projectId` 会话工作区（左侧对话；右侧工作台：预览 / 工作区 / 终端 / 版本）
- 每个项目有独立的文件、版本和 Agent 会话；容器 runtime 另有独立容器与 git 历史
- 首页项目卡支持重命名、删除；会话顶栏点击项目名也可重命名；首轮对话后会用小模型自动生成项目标题；工作台分「预览 / 工作区 / 终端 / 版本」四个 tab
- 工作区 tab 左侧文件树、右侧源码查看器（行号 + 语法高亮）
- 对话栏支持拖动调整宽度，刷新后保持
- 沙箱懒启动：打开项目只读缓存与版本；发送需求、同步文件或点击启动预览才拉起容器
- 容器实例默认 basic，可在工作区升级到 standard-1 / standard-2（不可降级）
- 自动选型项目先通过对话卡片确认需求/技术栈（runtime 对用户隐藏）；支持单向切换 runtime 并迁移旧文件
- Agent 支持 `ask_user` 问卷卡片、只读 `subagent` / `code_review` / `design_review`，
  以及 Impeccable WASM detector 驱动的 `design_check`
- 输入框支持 `/design-review`、`/code-review`、`/polish` 命令；输入 `/` 弹出命令菜单
- 预览支持元素选择；选中元素会并入本轮 `<runtime_context>`，不污染消息历史
- 预览刷新按运行时区分：static / React 直接读磁盘，全栈项目才重启 Node 进程

- 实现记录：`docs/implementation.md`
- 笔试说明：`docs/submission.md`
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
| 包管理 | pnpm | 11.6.0 |
| 构建 / 本地运行时 | Wrangler（workerd） | 4.164.0 |
| 发布 | Cloudflare Workers + D1 + Workers Domains | — |

版本是刻意锁定的：`agents` 与 `@cloudflare/ai-chat` 都处于 0.x，`ai` 7 刚稳定。
四者的 peer 约束已核对通过，**演示前不要升级**。

## 目录

```
apps/
  web/          Next.js 前端（首页工作台 + 会话工作区 + /design gallery）
  worker/       Cloudflare Worker（ChatAgent + WorkspaceDO + Projects DO + 容器沙箱）
packages/
  contracts/    共享契约（zod schema、类型、限制常量）
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
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # 填 MODEL_*；发布还需 CLOUDFLARE_API_TOKEN

# 两个终端
pnpm dev:worker    # :8787
NEXT_PUBLIC_WORKER_HOST=http://localhost:8787 pnpm dev:web   # :3000
```

生产部署：

```bash
NEXT_PUBLIC_WORKER_HOST= pnpm --filter @atoms-lite/web build
cd apps/worker
wrangler secret put MODEL_API_KEY -c wrangler.prod.jsonc
wrangler secret put CLOUDFLARE_API_TOKEN -c wrangler.prod.jsonc
wrangler deploy -c wrangler.prod.jsonc

# 只改 Worker 代码、没有容器变更时，可绕开 Cloudflare 容器设置 API 的临时 404：
wrangler deploy -c wrangler.prod.jsonc --containers-rollout=none
```

其它：

```bash
pnpm typecheck    # 三个包全部检查（web 会先跑 next typegen）
pnpm build
```

## 已就绪

- [x] pnpm workspace、共享 tsconfig、锁文件
- [x] Next.js + Tailwind v4 可启动
- [x] 设计 token + 两栏工作台 shell + 组件 gallery（`/design`）
- [x] AI Elements 组件接入（含本地化、shiki 按需高亮）
- [x] 容器启停、预览 HTTP/WS 代理、快照恢复、非破坏性版本回滚（PoC + 生产验证）
- [x] AIChatAgent 会话、停止、续传、多会话隔离、工具与审批（PoC 验证；v1 一项目一会话，审批未接线）
- [x] 运行事件表与时间线（PoC 验证；v1 未单独建 `atoms_run_events`）
- [x] **单角色生成闭环**：需求 → 工具写文件 → 预览 → 版本
- [x] **首页 + 会话页**：首页提交需求后进入工作区并自动发送
- [x] **多项目**：每次需求创建独立项目，项目之间互不影响
- [x] 项目重命名 / 删除；工作台 tabs；工作区文件树 + 源码查看器；对话宽度可调
- [x] 沙箱懒启动 + 文件列表 SQL 缓存
- [x] browser-static 运行时（无容器静态预览、SQLite 文件/版本、esm.sh 依赖）
- [x] 依赖安装工具（browser: importmap；container: pnpm add + 开放 egress）
- [x] **版本发布**：版本窗口发布到 Cloudflare Workers；项目固定域名/Worker/D1，
      版本切换更新 badge；全栈项目自动应用 D1 migration；已发布项目在首页显示 badge，
      版本列表支持取消发布（删除 Worker/域名，保留 D1）
- [x] **Token 用量**：主对话、planner、自动命名、subagent、上下文压缩统一记录
      输入/输出/缓存/推理 token 和费用；会话/项目/每日全站汇总，顶栏显示本会话用量
- [x] **上下文压缩**：按模型上下文比例自动 compaction（大窗口 50%、小窗口 65%），
      保留最近窗口，压缩调用也计入用量
- [x] 生产部署（`atoms-lite.fengyj.me`，静态资源 + Worker + Container）

## 未实现（按计划推进）

- [ ] 版本回滚 UI（后端已支持非破坏性 checkout）/ 导出 / 产物
- [ ] 多用户、身份认证与权限管理
- [ ] 发布环境扩展（预发/多区域；当前只有项目级生产环境）
- [ ] 附件与 R2
- [ ] D1 项目/会话元数据（平台索引；发布应用的 D1 已接入）
- [ ] Next.js（已明确不支持：实例与构建时间不匹配）
- [ ] 多角色（v1 不做，接口预留）
- [ ] 访问门禁与预算上限

## 已知约束

- 本机已安装 Docker（29.1.3），手动启动（不开机自启）；`wrangler dev` 走本地 Docker，不需要 Workers Paid。
- Ubuntu 的 `docker.io` 不含 buildx，已单独放到 `~/.docker/cli-plugins/docker-buildx`。
- Docker Hub 直连不通，已在 `/etc/docker/daemon.json` 配置 `docker.m.daocloud.io` 镜像站。
- 容器实例需要显式 `setInactivityTimeout()`，否则两次请求之间会被回收（详见 POC-00 文档）。
- `apps/web/AGENTS.md` 是 Next 16 自动生成的，可用 `agentRules: false` 关闭。
- 契约包通过 `exports` 直接暴露 `.ts` 源码，不设构建步骤。
- 演示版没有鉴权；预览 iframe 与主站同源，生成代码按不可信处理。
  生产化需要独立预览域 + 访问门禁。
- 容器 egress 已开放；生成代码可以访问互联网，需注意滥用与供应链风险。
- 发布用 D1 迁移只向前执行；目标版本缺少已应用 migration 时发布会失败，不会自动回滚数据库。
- 自定义域名绑定走 Workers Domains API 的 `PUT`；当前 wrangler OAuth token 可用，
  但约 1 小时过期，生产长期使用建议换长期 `CLOUDFLARE_API_TOKEN` 或定期刷新 secret。
- 发布产物存在 DO SQLite，单版本上限约 12 MiB；更大的应用需要 R2/Assets。
- 旧静态版本没有产物时发布会从版本快照自动重建；旧容器版本需重新构建并创建新版本。
- 取消发布会删除 Worker 和自定义域名，但保留 D1；再次发布会复用原 D1。
- Token 用量存在 `Projects` DO；v1 一项目一会话，所以会话总计与项目总计相同。
- `DAILY_COST_LIMIT_USD` 默认 **1 美元/天**，按 `USAGE_TIMEZONE`（默认 Asia/Shanghai）切日；
  `DAILY_COST_RESERVE_USD`（默认 0.05）用于避免单轮透支，剩余额度低于预留值时直接判定额度不足。
- 额度判断只发生在**新一轮请求开始前**，不会中断进行中的回合；额度不足时 UI 禁用输入框。
- 额度不足只显示输入框上方的临时横幅，不写 usage 事件，也不计入 token/费用。
- `DAILY_TOKEN_LIMIT` 仍可作为额外的 token 上限；默认不设置。
- DeepSeek V4.1 Flash 默认价格写死在代码里（input 0.15 / output 0.60 / cache read 0.003 USD per 1M，
  来源 models.dev `opencode-go`，2026-11-21）；可用 `MODEL_PRICING_JSON` 覆盖。
- 未配置价格的模型不会计入费用限额；新增模型时需要补价格表。
- 旧 Alpine/npm 快照仍可预览；安装新包请使用新项目（最终镜像只有 pnpm）。
- Playwright 1.63.0 对应本机缓存的 chromium-1243；升级会触发浏览器下载。
- 清理 dev 进程请按端口（`lsof -t -i:3000`），不要按名字模糊匹配（会杀掉 Next 的 postcss worker）。
