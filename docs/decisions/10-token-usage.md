# 10 · Token 用量、费用、上下文压缩与每日限额

状态：**已实现**（2026-11-21）

## 决策

对每一次真实模型调用记录一条 usage 事件，集中存放在 `Projects` DO：

- 主对话：`streamText` 的每个 step；
- 模板选型：`planTemplate`；
- 项目自动命名：`maybeAutoNameProject`；
- 子 agent：`subagent` / `code_review` / `design_review`；
- 上下文压缩：compaction 的 summarize 调用。

事件字段：

- `project_id`、`session_id`、`request_id`、`source`、`model`、`step_number`
- `input_tokens`、`output_tokens`、`total_tokens`
- `cache_read_tokens`、`cache_write_tokens`、`no_cache_tokens`
- `reasoning_tokens`
- `cost_usd`（未知价格为 null）
- `created_at`、`day`

同时原子 upsert `atoms_usage_daily`，用于系统级每日费用和限额。

每条事件写 `[usage.record]` 结构化日志，包含 tokens 与 cost；
`[agent.turn.finish]` 也包含本轮 input/output/cache/reasoning/total/cost。

## 上下文压缩

`ChatAgent` 构造时给 `sessions.session()` 注册 `createCompactFunction`：

- 默认 `COMPACTION_TOKEN_THRESHOLD=100000`；
- 默认 `COMPACTION_KEEP_RECENT_TOKENS=20000`；
- summarize 使用当前模型，单次超时 60s；
- 压缩调用记录 `source=compaction`，同样计入费用和每日限额。

压缩由 Agents SDK 在追加历史时自动触发；失败时不会破坏原历史。

## 汇总与展示

- 项目总计：按 `project_id` 汇总 `atoms_usage_events`。
- 会话总计：按 `session_id` 汇总；v1 一项目一会话，所以等于项目总计。
- 每日全站：`atoms_usage_daily` 按 `day` 汇总。
- 接口：
  - `GET /api/projects/:id/usage`
  - `GET /api/usage/status`
  - `GET /api/usage/daily`
- 会话页顶栏显示本会话累计 tokens 和缓存命中；弹窗展示
  输入/输出/缓存/请求数/费用、今日本项目和今日全站/每日费用上限。

## 每日限额

- `DAILY_COST_LIMIT_USD` 默认 **1 美元**；`DAILY_COST_RESERVE_USD`
  默认 **0.05 美元**，用于避免单轮透支。
- `DAILY_TOKEN_LIMIT` 仍可作为额外的 token 上限，默认不设置。
- 按 `USAGE_TIMEZONE`（默认 `Asia/Shanghai`）切日，不是 UTC。
- **判断只发生在下一轮模型请求开始前**，不会中断已经开始的回合；
  中间工具调用和 compaction 继续执行，下一轮再根据已记录的费用决定。
- 剩余额度低于预留金额时直接判定额度不足。
- 达到上限后：
  - 主对话返回普通助手文本“今日模型额度已用完”，不产生原始 JSON；
  - planner 回退规则模板；
  - 自动命名跳过，标记 fallback；
  - UI 禁用输入框并显示额度提示。
- 额度不足的提示**不是模型调用，不写 usage 事件**；它可能作为普通聊天消息存在，
  但不计入 token/费用。
- 用量查询失败时 fail-open，避免统计故障导致站点不可用。

## 费用

内置默认价格（OpenCode Go `deepseek-v4.1-flash`，models.dev，2026-11-21）：

```json
{
  "deepseek-v4.1-flash": {
    "inputPerMillion": 0.15,
    "outputPerMillion": 0.60,
    "cacheReadPerMillion": 0.003
  }
}
```

- 可用 `MODEL_PRICING_JSON` 覆盖或新增模型价格。
- 缓存写入价格缺失时按输入价格计算。
- 未知模型 `costUsd = null`，不计入费用限额；新增模型时要补价格。
- 历史事件不会因为后来补价格而自动回填费用。

## 被否方案

- **只在 Workers Logs 里记**：无法做会话/项目/每日查询，也无法驱动限额。
- **每个项目各自汇总**：系统级每日总量需要遍历所有 DO，成本和延迟都不可接受。
- **放 D1**：v1 平台元数据仍在 DO；引入 D1 需要新的 binding 和 migration，收益不足。
- **按请求只记一个 turn 总量**：主对话一个 turn 可能包含多次模型调用，无法定位成本来源；
  因此按 step 记录。
- **按字符估算 token**：不同模型/缓存差异大，优先使用 provider 返回的 usage。
- **费用直接用 0 占位**：会误导用户；用 null 表示未知。
- **在每个 step 前检查额度并中断**：会让模型处理到一半被截断；改为只在下一轮开始前检查。
- **额度不足时也写一条 0-token usage**：会污染统计；额度提示不进入 usage 明细。

## 影响与待办

- `Projects` DO 新增 `atoms_usage_events` / `atoms_usage_daily`。
- 删除项目时删除明细，但保留每日全站汇总。
- 上下文压缩已配置；阈值和保留窗口可通过环境变量调整。
- 默认价格来自 models.dev，后续可做动态价格同步。
- 多会话落地后，session 汇总会自然与 project 汇总分离。
