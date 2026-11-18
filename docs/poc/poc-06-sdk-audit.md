# POC-06 Agents SDK 能力审计

时间盒：**1.5 小时**。无依赖。

目标不是「把功能都做出来」，而是**确认哪些能力可以直接用、哪些要自己补、哪些 Phase 1 明确不用**。

## 1. 分类

### A. 文档已确认（只需记录用法，不写代码）

| 能力 | 结论 | 我们的用法 |
|---|---|---|
| 会话持久化 | `AIChatAgent` 自动存 DO SQLite | 直接用 |
| 断线续流 | 内建 resume | 直接用，不自建 SSE |
| 消息树 / 分支 | `Sessions` 支持分支与 change feed | Phase 1 不用分支 |
| 上下文压缩 | `Sessions` 的 compaction（读时摘要，不删原文） | 确认触发条件即可 |
| 实时同步 | WebSocket 广播 | 面板状态用 `useAgent` |
| 行大小保护 | 自动压缩接近上限的消息 | 直接用 |
| 子代理 | `subAgent()` / `agentTool()` | **Phase 1 不用** |
| 子代理存储隔离 | 独立 SQLite | 记录即可 |

### B. 需要探针确认（本 PoC 的核心）

| # | 问题 | 通过标准 |
|---|---|---|
| B1 | `useAgentChat` 是否暴露 `stop()`，调用后模型请求是否真的中止 | 停止后 3s 内无新 token；服务端日志显示 abort |
| B2 | DO 被驱逐/重启后，消息是否完整 | 强制重启后消息条数与内容一致 |
| B3 | 能否在同一个 DO 里建自己的表（versions/artifacts）而不与框架冲突 | 迁移成功，读写正常，互不干扰 |
| B4 | 自定义工具能否配合 AI SDK 7 的 `toolApproval` 工作 | 工具停在待审批，批准后继续，拒绝后给出结果 |
| B5 | 一个项目多个会话（不同 `name`）是否互不干扰 | 两个会话消息隔离，各自可恢复 |
| B6 | 面板事件能否与对话并行推送 | 对话流式时，`useAgent` 仍能收到状态更新 |
| B7 | 流式中刷新页面，能否恢复到相同位置 | 刷新后内容一致，且继续接收后续 token |

### C. Phase 1 明确不用（只记录成本，防止以后误用）

- 子代理 / `agentTool`
- `Sessions` 的分支与全文检索
- Workflows 集成
- MCP / OAuth
- 装饰器 `@callable()`（避免 TC39 装饰器配置）

## 2. 步骤

1. 先用官方 quickstart 跑通「一条消息 + 一个工具」。
2. 按 B1-B7 逐条做最小探针，每条只改一处。
3. 每条记录：可行 / 需绕路 / 不可行，以及绕路的具体做法。
4. 检查框架建的表名，确认我们的表名前缀（建议 `atoms_`）。

## 3. 通过标准

- [ ] B1-B7 全部有明确结论（可行 / 绕路 / 不可行）
- [ ] 列出**框架自建的表名**与迁移方式
- [ ] 明确「哪些能力我们依赖框架、哪些必须自己实现」的清单
- [ ] 给出「升级 SDK 会破坏什么」的风险点（哪些 API 是 0.x 实验性的）

## 4. Plan B

| 失败点 | 降级 |
|---|---|
| B1 停止不生效 | 服务端维护取消标志，工具执行前检查；UI 显示「正在停止」 |
| B2 重启丢消息 | 自己再落一份消息到独立表（牺牲一部分简洁性） |
| B3 表冲突 | 改用独立 DO 存产品数据，或全部加前缀并自管迁移 |
| B4 审批不可用 | 退化为「工具前置门禁」：写/执行类工具执行前先发事件并等待确认（不由框架中断） |
| B5 多会话不可用 | Phase 1 单会话 |
| B6 不能并行推送 | 面板改为轮询 |
| B7 刷新不能续 | 退化为「刷新后显示已完成内容」，流式期间不保证续传 |

## 5. 产物

- 一张 A/B/C 三类的最终清单
- 一份「依赖边界表」：能力 → 谁实现 → 升级风险
- spike 删除：`rm -rf spikes/poc-06-sdk-audit`

## 6. 风险

- `agents@0.33` 与 `@cloudflare/ai-chat@0.12` 都标着实验性。**审计结论要注明版本号**，否则两周后失效。
- 不要在这个 PoC 里做产品功能，否则会把「验证」变成「开发」。

## 结论

**核心项通过（B1 / B2 / B3 / B5 / B7），B4 / B6 本轮未覆盖。**

### 实测结果（2026-11-18）

| # | 验证项 | 结果 | 证据 |
|---|---|---|---|
| B1 | 停止是否真的中止 | ✅ | 停止前 48 字符，停止后 2.5s 仍 48，状态回到 `ready` |
| B2 | Worker 重启后消息是否还在 | ✅ | 重启后 `hasUser=true`，末块 `chunk-40` 在，完整 376 字符 |
| B3 | 自建表与框架表共存 | ✅ | `atoms_versions` 与 20+ 张 `cf_agents_*` / `cf_ai_chat_*` 表同库共存 |
| B5 | 多会话隔离 | ✅ | s2 初始为空；有自己的消息；不泄漏 s1；切回 s1 仍在；s2 重连后仍在 |
| B7 | 流式中刷新能否续上 | ✅ | 刷新后从 chunk-1 重放，继续增长到 chunk-40，状态 `streaming → ready` |
| B4 | 工具审批 | ⬜ | 需要 mock 产出 tool-call + `toolApproval`，本轮未做 |
| B6 | 面板事件与对话并行 | ⬜ | `cf_agents_state` 表存在，但未做 UI 侧探针 |

### 框架实际建的表（B3 副产物）

```
cf_agents_session_messages          # 消息
cf_agents_session_message_chunks    # 流式分片
cf_agents_session_compactions       # 压缩（说明 compaction 已内置）
cf_agents_streams / stream_blocks   # 耐久流（续传基础）
cf_agents_state                     # useAgent 状态同步
cf_agents_runs / jobs / task_*      # 运行与任务
cf_agent_tool_runs                  # 工具调用记录
cf_ai_chat_agent_tool_*             # 聊天工具审批/里程碑
_cf_KV / _cf_METADATA               # DO 内部
```

结论：**自建表必须加前缀**（我们用 `atoms_`），且不要改框架表结构。

### 三个环境坑（都会影响 POC-08）

1. **Next 16 默认拦截跨源 dev 资源。**
   Playwright 用 `127.0.0.1` 访问时，客户端 JS 不加载、页面不 hydration，表现为「点击没反应」。
   修复：`next.config.ts` 里 `allowedDevOrigins: ["127.0.0.1", "localhost"]`。
2. **Worker 的 CORS 必须回显 Origin。**
   `localhost:3000` 与 `127.0.0.1:3000` 是两个 origin，写死一个会让另一个的
   `get-messages` 失败，并导致 `useAgentChat` 抛错、页面白屏。
3. **会话名要放进 URL。**
   `useAgentChat` 的状态在内存里，刷新会回到默认会话，看起来像"消息丢了"。
   真实产品里会话 id 本来就在路由 `/sessions/:id`，这条只影响 PoC 页面。

### 对 POC-08 的输入

- `useAgentChat` 的 `stop` 可用，刷新续流可用，可以直接接 AI Elements。
- 不要自己实现消息持久化，框架已经在做；我们只加 `atoms_` 前缀的业务表。
- 工具审批需要额外配置 `toolApproval`，并且 mock 要能产出 tool-call，属于 POC-08 的范围。
