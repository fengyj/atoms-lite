# POC-08 Agent ↔ UI 接线

时间盒：**2 小时**。依赖 POC-01（组件已定）与 POC-06（框架能力已确认）。

这是把两条泳道合起来的验证点：**UI 定的形状，框架能不能真的喂出来。**

## 1. 要验证的假设

1. `useAgentChat` 返回的 `messages` 能直接驱动 POC-01 定义的消息/工具组件，无需改组件。
2. 工具调用在 UI 上能走完 `input-streaming → input-available → output-available`。
3. 审批能显示为卡片，批准/拒绝都会改变运行结果。
4. 面板状态（预览、版本、沙箱）能通过 `useAgent` 独立于对话更新。
5. 刷新页面后，对话与面板都能恢复。

## 2. 不在范围内

- 不接真实沙箱（用假工具：`sleep` + 返回固定 JSON）。
- 不做多角色。
- 不做真实版本写入（POC-04 已验证）。

## 3. 步骤

1. 用 `AIChatAgent` 起一个单会话 Agent，注册 3 个假工具：
   - `slow_tool`（3 秒后返回）
   - `fail_tool`（抛错）
   - `risky_tool`（需要审批）
2. 接 POC-01 的组件，依次验证：
   - 普通文本流
   - 工具卡片四态
   - 错误展示
   - 审批卡片 → 批准 / 拒绝
   - 运行中停止
3. 面板侧：用 `useAgent` 推一个假状态（预览 ready、版本 +1），确认与对话流并行更新。
4. 流式中途刷新，检查恢复。
5. 记录：组件是否需要改 props（需要改就是 POC-01 的失败）。

## 4. 通过标准

- [ ] 组件零修改即可渲染真实流（只允许改 mapper）
- [ ] 工具卡片四态全部出现且视觉正确
- [ ] 审批：批准后工具执行，拒绝后模型收到明确的拒绝结果
- [ ] 停止：3 秒内 UI 变为可输入，且不再追加 token
- [ ] 面板与对话同时更新时不互相阻塞
- [ ] 刷新后恢复：消息、当前状态、面板状态一致

## 5. Plan B

| 失败点 | 降级 |
|---|---|
| `useAgentChat` 形状与组件不匹配 | 写 mapper；若差异过大，改回 AI SDK 的 `useChat` + `WebSocketChatTransport`（同包内有此 API） |
| 工具事件不完整 | 只渲染「工具名 + 最终输出」，不做增量态 |
| 审批不可用（POC-06 已判不可行） | 用前置门禁：工具执行前发事件，UI 确认后再调用 |
| 面板不能实时更新 | 改为对话结束后刷新一次 |
| 刷新无法恢复 | 只恢复已完成内容，流式中显示「连接已断开，重新发送」 |

## 6. 产物

- 一份 mapper 代码（UIMessage → 组件 props），后续只维护它
- 一份「组件 props 是否需要变更」的结论，回写 POC-01
- spike 删除：`rm -rf spikes/poc-08-wiring`

## 7. 风险

- **这一项最容易变成「顺手把功能做了」**。严格只做 3 个假工具，不接沙箱。
- 如果这里发现组件要大改，说明 POC-01 的 view model 冻结失败——要立刻停下来改 POC-01，而不是在这里打补丁。

## 结论

**已实现，未完成端到端验证（环境问题）。**

### 已完成（2026-11-18）

- Worker 侧三个工具：`slow_tool`（1s）、`fail_tool`（抛错）、`risky_tool`（需审批）
- `streamText` 接入 `tools` + `toolApproval: { risky_tool: "user-approval" }`
- 前端用 AI Elements 渲染真实流：
  - `Message` + `MessageResponse` 渲染文本
  - `Tool` + `ToolHeader/ToolInput/ToolOutput` 渲染工具四态
  - `Confirmation` + 批准/拒绝按钮，调用 `addToolApprovalResponse({ id, approved })`
- `scripts/poc08.mjs`：覆盖成功 / 失败 / 批准 / 拒绝四条路径

### 未完成

端到端脚本没有跑通。原因不是代码，而是本地环境：

- 长时间会话后，Next dev 的 postcss 子进程反复被 OOM/挂起（`fetch` 返回 000，进程仍在）
- Worker 端口也出现过无响应
- 多次重启后仍不稳定

需要在干净环境下重跑：

```bash
pnpm dev:web
(cd spikes/poc-06-sdk-audit && pnpm exec wrangler dev --port 8796)
node scripts/poc08.mjs
```

### 一个重要发现：mock 无法驱动工具调用

`MockLanguageModelV4` 在 AI SDK 7 下有两种写法都不行：

| 写法 | 结果 |
|---|---|
| `tool-input-start` + `tool-input-delta` + `tool-input-end` | 能解析出 tool part，但不会组装成 tool-call，工具不执行 |
| `tool-call`（input 为字符串） | 能识别，但 `toolResults` 仍为 0，第二步不触发 |

结论：**工具调用链路必须用真实模型验证**，mock 只适合验证文本流、停止、持久化、续传（POC-06 的四项）。

### 对 POC-08 正式实现的建议

- 工具定义与 UI 渲染层已经可用，正式实现时直接复用。
- 审批卡片必须处理三种状态：`approval-requested`、`approval-responded`、`output-denied`。
- 真实模型的工具调用延迟明显（单步 5-15s），UI 必须有"正在调用工具"的中间态。
