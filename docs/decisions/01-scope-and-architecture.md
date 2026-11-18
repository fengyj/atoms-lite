# 01 范围与技术架构

状态：**已定**（2026-11-18）

## 1. v1 范围

| 项 | 决定 |
|---|---|
| 生成物 | **多文件项目**（Vite/React + SQLite 起步），不做单文件 HTML |
| 生成策略 | **模板优先**：预置基础项目，Agent 只改业务文件 |
| PPT | **不做** |
| 多角色 | v1 不实现运行时；**接口、字段、UI 入口预留** |
| 多会话 | v1 一项目一会话；但数据模型与 URL 保留 `sessionId` |
| 项目概念 | **引入**（长期容器、沙箱、版本、产物的归属） |
| 部署 | Cloudflare Workers + Containers；本地用 Docker |

## 2. 项目 / 会话 / 沙箱

```
Project
  ├─ Sandbox / Workspace（一套，项目级）
  ├─ Sessions（v1 只有一个，未来做分支）
  ├─ Versions（git commit + 元数据行）
  └─ Artifacts（R2 引用）
```

- **沙箱跟项目，不跟会话**：否则每开一个会话就多一套容器与快照。
- 会话是"同一工作区上的对话与版本分支"，版本记录带 `session_id`。
- 未来多会话时，写操作仍由项目级锁串行化。

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

- `@cloudflare/sandbox` 与原始 `ctx.container` 的取舍（见 04）。
- 角色清单（见 02）。
- 生产环境 Containers 与本地的一致性（见 04）。
