# 10 · Token 用量、会话/项目/每日汇总与限额

状态：**已实现**（2026-11-21）

## 决策

对每一次真实模型调用记录一条 usage 事件，集中存放在 `Projects` DO：

- 主对话：`streamText` 的每个 step；
- 模板选型：`planTemplate`；
- 项目自动命名：`maybeAutoNameProject`；
- 子 agent：`subagent` / `code_review` / `design_review`；
- 预留 `compaction` source，开启上下文压缩时接入。

事件字段：

- `project_id`、`session_id`、`request_id`、`source`、`model`、`step_number`
- `input_tokens`、`output_tokens`、`total_tokens`
- `cache_read_tokens`、`cache_write_tokens`、`no_cache_tokens`
- `reasoning_tokens`
- `cost_usd`（可为 null）
- `created_at`、`day`

同时原子 upsert `atoms_usage_daily`，用于系统级每日总量和限额。

## 汇总与展示

- 项目总计：按 `project_id` 汇总 `atoms_usage_events`。
- 会话总计：按 `session_id` 汇总；v1 一项目一会话，所以等于项目总计。
- 每日全站：`atoms_usage_daily` 按 `day` 汇总。
- 接口：
  - `GET /api/projects/:id/usage`
  - `GET /api/usage/status`
  - `GET /api/usage/daily`
- 会话页顶栏显示本会话累计 tokens 和缓存命中；弹窗展示
  输入/输出/缓存/请求数/费用、今日本项目和今日全站/每日上限。

## 每日限额

- 环境变量 `DAILY_TOKEN_LIMIT`：每日全站 token 上限；未设置表示不限制。
- 按 `USAGE_TIMEZONE`（默认 `Asia/Shanghai`）切日，不是 UTC。
- 达到上限后：
  - 主对话返回普通助手文本“今日模型额度已用完”，不产生原始 JSON；
  - planner 回退规则模板；
  - 自动命名跳过，标记 fallback；
  - subagent 抛出明确错误。
- 用量查询失败时 fail-open，避免统计故障导致站点不可用。
- 限额是 token 总量，不是费用；后续可以再加 cost 限额。

## 费用

- 价格表放在 `MODEL_PRICING_JSON`，单位为每百万 token 的美元价格：
  ```json
  {
    "deepseek-v4.1-flash": {
      "inputPerMillion": 0.28,
      "outputPerMillion": 0.42,
      "cacheReadPerMillion": 0.028
    }
  }
  ```
- 未配置价格表时 `costUsd = null`，UI 显示“未配置价格表”，不伪造 0 费用。
- 缓存价格缺失时按输入价格计算。
- 历史事件不会因为后来配置价格表而自动回填费用。

## 被否方案

- **只在 Workers Logs 里记**：无法做会话/项目/每日查询，也无法驱动限额。
- **每个项目各自汇总**：系统级每日总量需要遍历所有 DO，成本和延迟都不可接受。
- **放 D1**：v1 平台元数据仍在 DO；引入 D1 需要新的 binding 和 migration，收益不足。
- **按请求只记一个 turn 总量**：主对话一个 turn 可能包含多次模型调用，无法定位成本来源；
  因此按 step 记录。
- **按字符估算 token**：不同模型/缓存差异大，优先使用 provider 返回的 usage。
- **费用直接用 0 占位**：会误导用户；用 null 表示未知。

## 影响与待办

- `Projects` DO 新增 `atoms_usage_events` / `atoms_usage_daily`。
- 删除项目时删除明细，但保留每日全站汇总。
- 上下文压缩尚未配置；开启时需要把 compaction 的 summarize 调用接入 `recordUsage`。
- 价格表来源和成本上限策略待定。
- 多会话落地后，session 汇总会自然与 project 汇总分离。
