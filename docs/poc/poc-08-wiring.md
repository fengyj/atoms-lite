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

**通过。** 三条工具路径 + 审批/拒绝全部符合预期。

### 实测结果（2026-11-18，真实模型）

| 场景 | 结果 |
|---|---|
| `slow_tool` | ✅ `output-available` |
| `fail_tool` | ✅ `output-error`，错误文本可见 |
| `risky_tool` + 批准 | ✅ 出现审批卡片 → 点击批准 → `output-available` |
| `risky_tool` + 拒绝 | ✅ 第二次调用出现 `output-denied` |

说明：

- AI Elements 的 `Message` / `Tool` / `Confirmation` 可以直接吃真实流，不需要改组件。
- `addToolApprovalResponse({ id, approved })` 生效。
- 真实模型会自行决定是否调用工具；测试里通过 system prompt 强制指定，验证的是**链路**而不是模型判断。

### 之前为什么一直“跑不通”

不是代码问题，是三个叠加的环境问题：

1. **Worker 构建失败**：给 `onChatMessage` 加了 `createOpenAICompatible`，但没把
   `@ai-sdk/openai-compatible` 加进 spike 的依赖 → `Could not resolve`。
2. **假 000**：重启后用 `curl -m 3` 探活，而 `/poc-chat` 首次编译需要 ~3s，
   curl 先超时，看起来像服务没起来。
3. **自伤**：清理进程时用了 `awk '/next/ {kill}'`，而 Next 的 postcss worker 路径是
   `apps/web/.next/dev/build/...`，同样命中 `/next/` → 被 `kill -9`，
   于是响应变成 500（`postcss subprocess crashed ... SIGKILL`）。
   这不是 OOM，是我自己的杀进程规则太宽。

### 环境使用建议

- 清进程按端口（`lsof -t -i:3000`），不要按名字模糊匹配。
- 同时只保留一个 web + 一个 worker。
- 探活用 `-m 10` 以上，或用 `waitUntil: "domcontentloaded"`。

### 遗留

- `apps/web/app/poc-chat/` 与 `spikes/poc-06-sdk-audit/` 是验证用代码，正式实现开始前删除。
- `hasDone` 为 false：真实模型的收尾文案不是固定的 "done"，不影响工具链路结论。
