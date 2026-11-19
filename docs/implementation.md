# v1 实现记录（单角色 · 五子棋生成器）

状态：**已实现并部署**（2026-11-19）

## 1. 范围

- 两个页面：**首页工作台** `/` 与**会话工作区** `/sessions/:projectId`
- **多项目**：首页每次提交需求都会创建一个独立项目（独立容器、文件、git、版本、会话）
- 用户输入需求 → ChatAgent 调工具 → WorkspaceDO 写文件 → 启动预览 → 创建版本
- 生成物：多文件静态站点（`index.html` / `styles.css` / `app.js`），无构建步骤
- 目标示例：五子棋（15×15、双人对战、胜负判定、悔棋、重新开始、localStorage）

不在 v1：多角色、单项目内多会话、PPT、附件、导出、回滚 UI、D1/R2。
项目删除 / 重命名也暂未提供。

## 2. 组成

| 组件 | 位置 |
|---|---|
| ChatAgent | `apps/worker/src/agent.ts`（AIChatAgent + AI SDK tools，每项目 1 个实例） |
| WorkspaceDO | `apps/worker/src/workspace/do.ts`（每项目 1 个：容器/文件/版本/快照） |
| 项目索引 | `apps/worker/src/projects.ts`（`Projects` DO，项目元数据 + 版本摘要） |
| Workspace 客户端 | `apps/worker/src/workspace/client.ts` |
| Worker 路由 | `apps/worker/src/index.ts` |
| 沙箱镜像 | `apps/worker/Dockerfile` + `container/` |
| Web 首页 | `apps/web/components/dashboard/dashboard.tsx` |
| Web 工作区 | `apps/web/components/workspace/*` + `lib/agent.ts` |

架构与决策见 `docs/architecture/`、`docs/decisions/`。

## 2.1 页面结构

```text
/                     首页工作台（dashboard）
/sessions/:projectId  会话工作区（每个项目一个）
```

- `demo` 是 v1 遗留的五子棋项目；新项目 ID 形如 `prj_<12 位>`。
- Next 静态导出只生成一个会话壳 `/sessions/demo`；Worker 把
  `/sessions/<其它 id>` 复用到这个 shell，前端从 `pathname` 读取项目 ID。
- 本地开发用 Next rewrite（`/sessions/prj_:id → /sessions/demo`）模拟。

**首页 `/`**

- 左侧边栏：品牌、工作台/我的项目/模板/设置、最近项目、当前模式
- 主区：聚焦式需求输入（多行、模式选择、附件占位、⌘/Ctrl+Enter）
- 示例需求：五子棋 / 待办清单 / 作品集主页
- 概况：项目数、版本数、最近保存时间、沙箱状态（`preview/status`）
- 我的项目：真实版本数据（commit、summary、文件数、保存时间）+ 打开工作区
- 提交需求 → `POST /api/projects` 创建项目 → 跳转 `/sessions/:id?prompt=...`
- 项目卡直接展示真实版本摘要、commit、保存时间与版本数

**会话工作区 `/sessions/:projectId`**

- 三栏：对话、预览、Sandbox/产物/版本（窄屏切换）
- Agent 实例名 = 项目 ID，因此对话历史、工具调用、容器、版本都按项目隔离
- 进入时读取 `?prompt=`，待 Agent 连接就绪且当前空闲后自动发送；
  发送前用 `history.replaceState` 清掉 query，刷新不会重复发送
- 顶栏显示项目名与项目 ID，logo 可返回首页

首页与工作区之间没有额外的管理页面；设置、版本、文件都在工作区面板内完成。

## 3. 关键行为

- 每个项目一个 WorkspaceDO + 一个容器；沙箱空闲 **5 分钟**回收。
- 版本创建与 `finish` 时自动快照，重启时从该项目的快照恢复。
- 项目索引 `Projects` DO：保存 `id/name/prompt/createdAt`，读取时并发向各
  WorkspaceDO 的 `/meta` 补齐版本数与当前版本（不启动容器）。
- 预览通过 Worker 代理 `/previews/demo/*`；容器内的服务只支持 HTTP，代理时把 scheme 改成 `http:`。
- 预览状态由 `GET /api/workspace/preview/status` 探测（`running` / `ready`）；前端每 1.2s 轮询，45s 未就绪显示「失败」。
- 版本 = git commit + `atoms_versions` 行；版本列表在容器停止时仍可读。
- 写文件走 `Files`（需要镜像内的 `sandbox-shim`）；命令走 `exec`（程序白名单）。
- 前端同源访问；本地开发用 `NEXT_PUBLIC_WORKER_HOST=http://localhost:8787`。
- 项目 API：`/api/projects`（列表/创建）、`/api/projects/:id`（详情）、
  `/api/projects/:id/{versions,files,preview/*}`；预览 `/previews/:id/*`。
- 旧的 `/api/workspace/*` 仍映射到 `demo`，仅作兼容/调试。

## 4. 验证记录

### 本地

- 容器启动 ~1s；模板 3 个文件；预览 200。
- 真实模型生成：**约 90 秒**完成 `list_files → write_file × 3 → exec → start_preview → create_version`。
- 预览标题 `五子棋 · Gomoku`；点击棋盘后「已落子 1 手」「轮到白棋」；localStorage 写入；无 console 错误。

### 生产（https://atoms-lite.fengyj.me）

![生产界面](assets/v1-production.png)


- 静态资源 200；`/health` 200；容器冷启动 ~8s。
- 真实 UI 输入 → 版本创建 → 预览可玩；生成约 3 分钟。
- 预览 200，文件列表 3 个，版本列表 1 条（commit `1d6d331`）。
- 点击棋盘点位后手数增加、执子方切换。
- **空闲回收恢复**：停止请求 400s 后 `preview/status` 为 `{running:false}`；再请求 `/previews/demo/` 返回 200、标题仍为「五子棋 · Gomoku」，3 个文件大小不变，版本仍为 `1d6d331`。
- **预览状态探测**：正常时徽标 `加载中 → 就绪`；强制 `ready:false` 时 45s 后显示「失败」。

### 多项目隔离（生产）

- 首页创建「待办清单」项目 → `prj_3e5dee2fc07e`，整页进入 `/sessions/prj_3e5dee2fc07e`。
- 工作区标题 `待办清单 · atoms-lite`，预览地址 `/previews/prj_3e5dee2fc07e/`。
- 约 3 分钟生成完成，新项目版本 1 条（`0fed082`），预览标题「待办清单」。
- 同时检查五子棋项目：仍为 **2 个版本**（`50fff0b`），预览标题仍是「五子棋 · Gomoku」。
- 首页同时显示两个项目，项目数 2、版本数 3。
- 无 console / page 错误。

### 首页 → 工作区闭环

![首页工作台](assets/v1-dashboard.png)

- `/` 200，标题正确；项目卡显示真实 commit、summary、文件数与保存时间。
- 点击项目卡 → `/sessions/demo` 200，三栏工作区正常加载。
- 在首页输入修改需求并点「开始生成」：
  - 跳转 `/sessions/demo?prompt=...`，随后 query 被清空；
  - Agent 连接就绪后自动发送，对话中可见该需求；
  - 约 3 分钟后生成完成，新版本 `50fff0b`，summary 为提子计数条改动；
  - 首页刷新后显示新版本；预览出现「黑棋提子 / 白棋提子」计数条；
  - 点击棋盘仍可正常落子（`已落子 1 手`、`轮到白棋落子`），无 console 错误。

## 4.1 代码审查

详见 `docs/reviews/v1-code-review.md`。P0（快照/seed 覆盖）与关键 P1（ensure 覆盖、healthz、checkout、幂等、超时、白名单、Origin）已修复并通过生产回归；审批接线、预览错误态等列为后续。

## 4.2 页面截图

| 首页（多项目） | 工作区（待办清单） |
|---|---|
| ![首页](assets/v1-dashboard.png) | ![工作区](assets/v1-workspace-todo.png) |

五子棋工作区见 `assets/v1-workspace.png`。

## 5. 已知限制

- 没有访问控制；公网 URL 可被任意人使用（演示期接受，需加预算上限）。
- 每个项目固定一个会话；项目不能删除或重命名。
- 项目索引在 `Projects` DO 中，尚未迁移到 D1；项目多时首页需要 N 次 DO 读取。
- 每个活跃项目都会占一个容器；并发项目多时受 Cloudflare 容器配额限制。
- 导出按钮禁用；产物 tab 空态；回滚没有 UI。
- 生成模板固定为静态站点，不支持 npm 依赖与构建。
- ChatAgent 的 `create_version` 可能被模型调用两次；已做幂等，不会插重复版本。
- 预览的 HMR 未验证（静态站点不需要）。

## 6. 本地运行

```bash
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars  # 填 MODEL_*
pnpm dev:worker   # :8787
pnpm dev:web      # :3000（需 NEXT_PUBLIC_WORKER_HOST=http://localhost:8787）
```

## 7. 生产部署

```bash
NEXT_PUBLIC_WORKER_HOST= pnpm --filter @atoms-lite/web build
cd apps/worker
wrangler secret put MODEL_API_KEY -c wrangler.prod.jsonc
wrangler deploy -c wrangler.prod.jsonc
```

域名：`atoms-lite.fengyj.me`（Custom Domain）。
