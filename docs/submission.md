# atoms-lite 笔试说明

> 一句话：用户用自然语言描述需求，Agent 在隔离工作区里真实读写代码、构建、启动预览并保存可回滚版本。
>
> 线上：https://atoms-lite.fengyj.me
>
> 更细的实现记录见 [`implementation.md`](implementation.md)，架构见 [`architecture/system-architecture.md`](architecture/system-architecture.md)，
> 决策见 [`decisions/`](decisions/)。

## 1. 实现思路

### 1.1 核心闭环

```text
描述需求
  → 规则/小模型推断模板
  → ask_user 确认产品问题（不暴露运行环境）
  → 配置项目
  → Agent 调工具写文件 / 装依赖 / build
  → 启动预览
  → create_version（git commit + 元数据 + 快照）
  → 继续对话迭代
```

目标不是“生成一段代码”，而是交付一个**能运行、能继续改、能恢复**的项目。

### 1.2 三个关键设计

**1. 项目是隔离单位，不是会话。**

每个项目有自己的 `WorkspaceDO`、容器、文件、git 历史和版本。会话只是项目的入口；
v1 是一项目一会话，URL 和 ChatAgent 实例都按 `projectId` 寻址，多会话是后续设计。

**2. Agent 只做决策，工具执行收敛到 `WorkspaceDO`。**

ChatAgent 负责模型循环、上下文和工具选择；真正的文件、命令、构建、预览、版本操作
全部通过 `WorkspaceDO` 执行。这样：

- 容器只有一个持有者；
- 同一项目的写操作可以串行化；
- 本地开发和生产行为一致，不依赖“子代理能否访问父容器”这种平台差异。

**3. 生成策略是模板优先，不是从零生成整个工程。**

模板负责构建配置、依赖、路由和基础视觉；Agent 只改业务文件。这样构建稳定、耗时可控、
依赖可预测。代价是生成物形态受限，需要维护模板。

### 1.3 运行环境对用户隐藏

这里的“运行环境（runtime）”指项目实际在哪里执行：`browser`（Worker 直接服务）或
`container`（容器）；它不同于 Node/V8 语言运行时。模板则是 `static` / `react-vite` /
`fullstack-hono`。

用户不需要理解这些模板，也不需要选运行环境。

- 规则先判断：登录、数据库、API、上传等信号 → full-stack；React/组件/路由 → react-vite；否则 static。
- 规则不确定时，调用一次短模型（12s 超时、0 重试）选择最小模板。
- 创建后项目先处于 `pending`，模型用 `ask_user` 只问产品问题；
  客户端调用 `/configure` 后才挂载完整工具。
- 第一次文件操作才真正启动容器，保持懒启动。

### 1.4 预览与版本

- static / React：构建产物在磁盘，静态 server 每次请求读磁盘，刷新 iframe 即可。
- full-stack：长驻 Node 进程，必须重启才能加载新的服务端代码。
- 版本 = git commit + `atoms_versions` 行；browser 项目用内容 SHA-256。
- 回滚采用非破坏性方式：先自动保存未提交改动，再 `git read-tree` 恢复目标树，
  创建新的 rollback commit；checkout 后校验 Git HEAD 与 currentVersion。

### 1.5 设计质量

生成项目在 build 后、创建版本前可以调用 `design_check`：

- 内置 Impeccable WASM detector，扫描源码里的 AI slop、小字、对比度、间距、嵌套卡片等问题；
- `design_review` 先跑 detector，再把确定性 findings 交给只读设计子 agent；
- 它只覆盖源码规则，不冒充渲染后的完整视觉回归。

## 2. 关键取舍

### 2.1 Cloudflare 还是 Vercel

**结论：选 Cloudflare。**

| 维度 | Cloudflare | Vercel |
|---|---|---|
| 静态站点 / Next.js | Workers Assets，够用 | 更强，Next.js 一等公民 |
| 长驻沙箱 | Containers，和 DO 绑定 | 需要外部沙箱供应商 |
| 有状态协调 | Durable Objects | 需要外部 Redis/DB/队列 |
| WebSocket + 会话 | DO 原生支持，可休眠 | 需要外部连接层 |
| 对象存储 | R2 | 需要 S3/R2 等 |
| 本地开发 | Wrangler + Docker | `next dev` 更顺 |
| 平台成熟度 | Containers 较新，运维细节多 | 更成熟、DX 更好 |

选择 Cloudflare 的核心理由不是“托管 Next.js”，而是：

- 这个产品最难的部分是**长驻沙箱 + 有状态协调 + 实时会话**，不是静态托管；
- DO 把“唯一身份、串行执行、SQLite、WebSocket、Alarm、容器绑定”收进一个原语，
  少掉了 Redis 锁、外部会话表、容器注册表、队列等一套基础设施；
- Web 是静态导出，Vercel 最大的优势（Next SSR / 预览部署）在这里用不上；
- 一个平台内的 Worker + DO + Container + Assets，演示链路更短。

代价：

- Workers 运行时有限制，Container 仍较新；
- 本地需要 Docker/Wrangler 环境；
- 单例 Projects DO 是热点，规模大时应该迁 D1；
- 同源预览有安全边界问题，生产化需要独立预览域。

**如果重来：** 如果团队已经在 Vercel、产品是 Next.js SSR 为主、沙箱可以接受外部供应商，
Vercel + 外部沙箱 + Postgres/Redis 也是合理方案；本项目的选择是因为“沙箱和状态协调”是核心，
而不是因为 Vercel 不好。

### 2.2 LangGraph、Vercel AI SDK 还是 Cloudflare Agents

这三个不是同一层的东西，实际选型是**组合**：

| 方案 | 擅长 | 不擅长 |
|---|---|---|
| LangGraph.js | 显式状态图、多角色、checkpoint、人机中断 | 对单 Agent 偏重；会和 DO 的状态/会话重复 |
| Vercel AI SDK（`ai`） | 流式输出、tool call、消息转换、UI hooks | 不提供持久会话、DO 协调、WebSocket |
| Cloudflare Agents SDK | AIChatAgent、DO 会话、WebSocket/hibernation、工具接线 | 复杂多角色编排需要自己补任务表/调度 |

**结论：Cloudflare Agents SDK + Vercel AI SDK。**

- AI SDK 负责模型流、工具调用和消息转换；
- Agents SDK 负责会话 DO、WebSocket、状态和工具接线；
- 没有引入 LangGraph，因为 v1 是单 Agent 工具循环，引入状态图会增加依赖和一套重复的状态模型；
- `subagent` / `code_review` / `design_review` 是轻量只读委派，不是完整的多角色图。

代价：

- 多角色、任务板、handoff、预算和 checkpoint 还没有显式编排；
- 以后做多角色时，可以在 `ChatAgent` 里补 Scheduler/任务表，或引入 LangGraph；
  但应该先把单角色闭环的信任问题（回滚 UI、审批、鉴权）补完。

**如果重来：** 如果“多角色协作”是核心卖点而不是后续扩展，应该从第一天就用显式任务图/状态机，
而不是先做单 Agent 再补。

### 2.3 沙箱环境

沙箱的候选可以归为三类：

1. **Cloudflare Containers**：长驻容器，有磁盘、进程、端口，能跑 pnpm/build，能和 DO 绑定；
2. **`@cloudflare/sandbox`**：提供文件 API，但官方镜像只有 shim，没有 shell；
3. **外部沙箱**（独立容器/微 VM 服务）：更成熟，但多一个供应商、网络跳转、鉴权和计费边界。

**结论：Cloudflare Containers + 原始 `ctx.container`。**

- 文件读写用 `Files`（需要镜像带 `sandbox-shim`）；
- 执行命令用 `ctx.container.exec`；
- 预览用 `ctx.container.getTcpPort`；
- 快照用 `ctx.container.snapshotContainer`；
- 本地用 Wrangler + Docker 验证，生产用 Cloudflare Containers。

POC 数据：

| 指标 | 本地 | 生产 |
|---|---|---|
| 冷启动 | ~1.6s | ~8.1s |
| 热调用 | ~230ms | 27ms |
| 快照 | 76MB / 3.0s | 2.5KB diff / 4.2s |
| 恢复 | — | 1.4s |

代价：

- Container 仍较新，部署时遇到过容器设置 API 的临时 404，需要用
  `wrangler deploy --containers-rollout=none` 绕过；
- 旧快照可能没有 `boot.sh` supervisor，需要兼容降级；
- 每个活跃项目占一个容器，受实例配额限制；
- 快照不是长期数据库，跨实例恢复应换 D1/R2。

**如果重来：** 如果团队不想维护容器镜像和 supervisor，外部沙箱更省事；
如果要求强隔离/自托管，Kubernetes + gVisor/Firecracker + Postgres/S3 更合适。

### 2.4 数据存储：DO SQLite，还是 D1 + R2

**结论：v1 只用 DO SQLite；D1/R2 是目标，不是当前实现。**

- `Projects` DO：项目索引；
- `ChatAgent` DO：消息、流、压缩（框架表）；
- `Workspace` DO：版本、文件缓存、快照指针、运行环境配置/migration；
- 容器：生成应用源码、`node_modules`、全栈 SQLite、应用内部上传文件；
- 浏览器静态项目：文件在 DO SQLite。

为什么先不用 D1：

- 单用户、少量项目，一个单例 `Projects` DO 足够；
- 不需要跨项目全局查询、多用户权限过滤；
- 少一个 binding、一套 migration 和一次跨库一致性处理。

为什么先不用 R2：

- 平台附件、导出包、完整日志都还没实现；
- 生成应用内部的用户上传由生成应用自己写入容器，随快照保留；
- 浏览器静态文件是小文本，放 DO SQLite 够用。

代价：

- 单例 Projects DO 是热点，首页要 N 次 DO 读取；
- DO SQLite 有单对象存储/吞吐上限，不适合大量二进制；
- 容器快照不是长期数据库，不能替代 D1/R2；
- 没有平台附件，就还没有“用户把文件交给 Agent”的完整能力。

### 2.5 版本：只回代码，不回数据

**结论：版本切换只恢复代码，不恢复容器快照。**

- 如果回滚连快照一起恢复，会把应用数据（例如全栈 SQLite）也回滚掉；
- 用户通常只想撤销代码改动，不想丢数据；
- 快照只用于容器重建/空闲恢复，不作为版本单位。

回滚采用“新提交”而不是 `reset --hard`：

- 先自动保存未提交改动；
- `git read-tree --reset -u <target>`；
- 生成新的 rollback commit / version；
- 校验 Git HEAD 与 currentVersion。

### 2.6 生成策略：模板优先

**结论：模板优先，Agent 只改业务文件。**

- 构建稳定、依赖可控、耗时可控；
- 三种模板覆盖静态、React、全栈；
- 代价是生成物形态受限，需要维护模板；
- Next.js 明确不支持：实例规格和构建时间不匹配。

### 2.7 设计质量：detector + 只读评审

**结论：确定性的源码扫描 + 只读设计子 agent。**

- 不依赖模型主观判断的部分交给 Impeccable WASM detector；
- 设计子 agent 负责信息层级、间距、状态和响应式；
- 不把“设计检查”做成预览里的独立按钮，而是走 `design_review` / `/design-review`；
- 源码规则不覆盖渲染后的对比度/溢出，不冒充完整视觉回归。

### 2.8 安全边界

- 生成代码只在容器内运行，不接触平台密钥；
- 命令走程序白名单，路径限制在 `/workspace`；
- 预览通过 Worker 代理，不直接暴露容器端口；
- v1 演示版没有鉴权，预览与主站同源，生成代码按不可信处理；
- 生产化需要独立预览域、访问门禁和预算上限。

## 3. 当前完成程度

### 3.1 已完成

| 模块 | 状态 |
|---|---|
| 首页工作台 / 会话工作区 | ✅ |
| 多项目隔离 | ✅ |
| 三种模板：static / react-vite / fullstack-hono | ✅ |
| browser / container 两种运行时 | ✅ |
| 自动选型 + `ask_user` + `/configure` | ✅ |
| 文件读写 / 编辑 / 依赖安装 / build / exec | ✅ |
| 预览代理、地址栏导航、元素选择 | ✅ |
| 版本创建、版本列表（只读） | ✅ |
| 非破坏性回滚后端 + HEAD 校验 | ✅ |
| 运行环境单向切换与迁移 | ✅ |
| 容器实例手动升级 | ✅ |
| `design_check` / `design_review` / `code_review` | ✅ |
| `/design-review`、`/code-review`、`/polish` 命令 + `/` 菜单 | ✅ |
| 会话时间分隔、ask_user 历史问答、步数上限确认卡 | ✅ |
| 生产部署 | ✅ |

### 3.2 部分完成

| 模块 | 现状 |
|---|---|
| 版本回滚 UI | 后端已支持，前端只有只读列表 |
| 审批 | UI 组件存在，但写/exec 仍自动执行，未接线 |
| 可观测性 | 有框架消息和 Workers Logs，没有自建 Run 表/时间线 |
| 附件 | PromptInput 组件支持文件，但对话面板未接入，也没有 R2 |
| 多会话 | v1 一项目一会话；URL 和 Agent 实例当前都按 `projectId`，多会话是后续设计 |
| 预览 | 支持刷新/导航/选择，HMR 未验证 |
| 设计审查 | 源码 detector + 子 agent，未做渲染后视觉回归 |

### 3.3 未完成

- 多用户、身份认证、权限管理
- 多角色、`@角色`、任务板、写锁
- 平台附件与 R2
- D1 项目/会话元数据
- 部署到 Cloudflare（生成物的公网发布）
- 导出 / 发布 / Artifacts 面板
- PPT / 非 Web 产物
- 访问门禁、预算和速率限制
- 版本 diff / 对比 / 回滚 UI
- 真正的运行事件表和成本看板
- Next.js 生成

### 3.4 已验证

- `pnpm typecheck`、web 静态导出、生产部署
- 三种模板在生产跑通：静态、React、全栈
- 全栈预览重启、旧快照兼容、容器快照恢复
- 非破坏性回滚：marker 文件恢复、历史保留、新的 rollback commit
- design detector 扫描、`/design-review` 命令、元素选择并入运行环境上下文（`runtime_context`）
- 首页/工作台响应式与横向溢出检查

## 4. 如果继续投入时间

优先级判断：

```text
多用户（身份认证 + 权限管理）
  → 部署闭环（先 Cloudflare）
  → 会话体验 / 模板 / Prompt / Skill
  → 多角色
```

理由：

- **多用户越晚做越贵**：它会影响数据归属、存储 schema、API 鉴权、DO 路由和 UI 状态，
  后补等于把已有链路全部改一遍；
- **部署是当前端到端唯一缺的环节**：现在能生成、预览、保存版本（回滚后端已有），
  但还不能把产物交付到公网；
- **会话/模板/Prompt/Skill 是杠杆**：不改数据模型，能持续提升生成质量和体验；
- **多角色复杂度最高**：会放大写冲突、上下文隔离、预算、审批和失败恢复，应该放在最后。

### P0：多用户支持（身份认证、权限管理）

| 事项 | 说明 |
|---|---|
| 身份认证 | 登录、会话、Token 刷新；先支持一种主登录方式，不追求全 |
| 数据归属 | 项目/版本/会话/产物增加 `owner_id`；Projects 查询按用户过滤 |
| 权限模型 | 项目级读/写/预览/部署权限；分享链接与只读访问 |
| API / DO 鉴权 | Worker 路由、WorkspaceDO RPC、预览代理都要校验身份和项目权限 |
| UI 状态 | 登录页、账户菜单、401/403、分享入口、审计记录 |
| 存储调整 | 这一阶段会自然把 **D1/R2 提前**：用户归属需要全局查询，用户文件需要对象存储 |

这一阶段建议和以下“信任项”同批做，否则多用户会放大风险：

- 版本回滚 UI + 版本 diff；
- 审批接线（写文件/执行命令）；
- 速率限制、预算上限、审计日志；
- 预览错误态、重试和超时收敛。

### P1：部署闭环（先 Cloudflare）

目标：把“预览中的项目”变成“有公网 URL 的部署”。

| 事项 | 说明 |
|---|---|
| 部署 static / React | 输出到 Workers Assets 或 Pages；生成部署记录 |
| 部署 full-stack | 先评估 Workers + D1/R2，或沿用容器；不强行用同一种形态 |
| 版本与部署关系 | 部署记录绑定 versionId；支持重新部署和回滚到旧版本 |
| 环境与密钥 | 部署环境变量、Secret 引用、自定义域名 |
| 部署历史 | 状态、URL、时间、版本、失败原因 |

先只支持 Cloudflare，其他云厂商/自托管放到后面；部署是端到端闭环的最后一块，
优先级高于更多生成形态。

### P2：会话体验、模板、Prompt、Skill

| 事项 | 说明 |
|---|---|
| 会话界面 | 加载/重试状态、工具日志按轮折叠、版本面板可操作、移动端 |
| 模板优化 | 更好的 starter、常见页面模式、可访问性、响应式基线 |
| Prompt 优化 | 减少无效工具循环、失败恢复、工具使用纪律、上下文压缩 |
| Skill 系统 | 把设计审查、代码审查、部署、模板选择等做成可复用 skill/命令 |

这些工作不改数据模型，属于持续迭代的“生成质量杠杆”，适合在多用户和部署稳定后推进。

### P3：多角色

- 任务板、handoff、项目写锁、预算和失败恢复；
- 当前 `subagent` / `code_review` / `design_review` 是轻量只读委派，不是完整多角色；
- 多角色应该在单用户闭环、部署和基础信任项都稳定后再做。

**为什么不是先做多角色？**
多角色会放大所有基础问题：写冲突、上下文隔离、预算、审批、失败恢复。
当前单角色闭环已经能证明“真实修改 + 运行 + 版本”，下一步应该先把“多用户 + 部署”
这两个会改变数据模型和交付形态的地基补上，而不是先增加角色数量。

## 5. 早期技术选型回顾

> 以下根据项目里的决策记录和 PoC 结论整理；早期讨论的逐字记录没有完整留档，
> 如果和当时的口头结论有出入，以代码和 `docs/decisions/` 为准。

### 5.1 当时讨论的三个问题

1. **托管用 Cloudflare 还是 Vercel？**
2. **编排用 LangGraph、Vercel AI SDK，还是 Cloudflare Agents？**
3. **沙箱环境用什么？**

### 5.2 结论对照

| 问题 | 候选 | 结论 | 主要原因 |
|---|---|---|---|
| 托管 | Cloudflare / Vercel | Cloudflare | 沙箱、状态协调、WebSocket、容器绑定在一个平台；Web 只是静态导出 |
| 编排 | LangGraph / AI SDK / Agents | Agents SDK + AI SDK | 单 Agent 工具循环；AI SDK 负责流和工具，Agents 负责 DO/WebSocket |
| 沙箱 | CF Containers / `@cloudflare/sandbox` / 外部沙箱 | CF Containers + 原始 `ctx.container` | 需要长驻、磁盘、端口、构建、快照；`@cloudflare/sandbox` 只用于文件 API |

### 5.3 如果换一个约束

- **团队已经在 Vercel、产品是 Next.js SSR 为主**：Vercel + 外部沙箱 + Postgres/Redis 更顺；
- **多角色是核心卖点**：从第一天就用显式任务图/状态机（LangGraph 或自研 Scheduler），
  不要先做单 Agent 再补；
- **要求强隔离/自托管**：Kubernetes + gVisor/Firecracker + Postgres/S3；
- **只做静态页面生成**：不需要容器，Workers + R2/D1 就够，成本和复杂度都更低。

## 6. 附：运行与验证

```bash
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # 填 MODEL_*

# 两个终端
pnpm dev:worker
NEXT_PUBLIC_WORKER_HOST=http://localhost:8787 pnpm dev:web
```

生产：

```bash
NEXT_PUBLIC_WORKER_HOST= pnpm --filter @atoms-lite/web build
cd apps/worker
wrangler deploy -c wrangler.prod.jsonc

# 无容器变更时
wrangler deploy -c wrangler.prod.jsonc --containers-rollout=none
```

更细的模块、验证数据和已知限制见 [`implementation.md`](implementation.md)。
