# 01 范围与技术架构

状态：**已定**（2026-11-18）

## 1. v1 范围

| 项 | 决定 |
|---|---|
| 生成物 | **多文件项目**：static / React-Vite / 全栈 Hono + SQLite，不做单文件 HTML |
| 生成策略 | **模板优先**：预置基础项目，Agent 只改业务文件 |
| PPT | **不做** |
| 多角色 | v1 不实现运行时；**接口、字段、UI 入口预留** |
| 多会话 | v1 一项目一会话；但数据模型与 URL 保留 `sessionId` |
| 项目概念 | **引入**（长期容器、沙箱、版本、产物的归属） |
| 部署 | Cloudflare Workers + Containers；本地用 Docker |

## 2. 运行时拓扑（2026-11-19 更新）

```
Project（v1: Projects DO；目标: D1 元数据）
  ├─ WorkspaceDO（每项目一个）
  │    ├─ container（唯一持有者）
  │    ├─ 文件 / exec / 预览 / 快照
  │    ├─ 项目级写锁
  │    ├─ git 仓库 + 版本元数据
  │    └─ WorkspaceTools RPC
  ├─ ChatAgent DO（每项目；v1 一项目一会话，Builder）
  └─ Verifier DO（后续）
```

- **沙箱跟项目，不跟会话**：否则每开一个会话就多一套容器与快照。
- **角色不拥有容器**。所有沙箱操作由 `WorkspaceDO` 执行，角色通过 RPC 调用。
- v1 有 `Projects` + `WorkspaceDO` + `ChatAgent` 三个 DO；Verifier 后加。
- 多会话 = 多个 ChatAgent DO 共享同一个 WorkspaceDO，写操作由 WorkspaceDO 的锁串行化。

原因：POC-10 在本地验证了**子代理无法访问父对象的运行中容器**（`running: false`），
但在生产（Cloudflare Containers）中子代理可以访问父容器（facet 共享机器）。
两种行为不一致，因此**架构不依赖任何一种**：统一走 `WorkspaceDO` 的 RPC，
本地与生产表现一致。

## 3. 技术栈（锁定版本）

| 层 | 选型 | 版本 |
|---|---|---|
| Web | Next.js / React / Tailwind | 16.4.6 / 19.3.1 / 4.3.5 |
| UI 组件 | AI Elements（vendored 源码） | registry |
| Chat 传输 | `@cloudflare/ai-chat` | 0.12.2 |
| Agent 运行时 | `agents`（Agents SDK） | 0.33.0 |
| 模型 | AI SDK + OpenAI 兼容端点 | 7.0.176 |
| 语言 | TypeScript | 6.0.3 |
| 构建 | Wrangler / workerd | 4.164.0 |

**演示前不升级**：`agents` 与 `@cloudflare/ai-chat` 都是 0.x，`ai` 7 刚稳定。

## 4. 已确认的架构边界

- 对话走 `AIChatAgent` + `useAgentChat`（WebSocket，UIMessage 流）。
- 面板状态走 `useAgent`（DO state 同步）。
- 业务数据（项目/版本/产物/任务/事件）走**自建表**，统一 `atoms_` 前缀，不改框架表。
- 生成代码只在 Sandbox 内运行；控制面不执行模型生成的代码。
- 预览通过 Worker 代理（`getTcpPort`），不暴露容器端口。

## 5. 被否方案

| 方案 | 原因 |
|---|---|
| 单文件 HTML 生成 | 与"多文件项目"目标不符，且无法验证构建/依赖 |
| 从零生成整个工程 | 慢、方差大、依赖不可控；改为模板优先 |
| 沙箱按会话 | 存储与恢复成本翻倍 |
| 多会话 v1 | 产品层工作量（列表/路由/级联删除）与演示收益不匹配 |
| PPT 产物 | 与核心闭环无关，时间不够 |

## 6. 待定

- `@cloudflare/sandbox` 与原始 `ctx.container` 的取舍（见 04；v1 用 `ctx.container` + `Files`）。
- 角色清单（见 02）。
- 生产环境 Containers 与本地的一致性（见 04；v1 已跑通静态/React/全栈）。
