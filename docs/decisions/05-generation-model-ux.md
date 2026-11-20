# 05 生成策略、模型基线与 UI

状态：**已定**（2026-11-18）

## 1. 生成策略：模板优先

```
预置 Vite + React + Tailwind + SQLite 模板
  → Agent 只改 pages / components / lib 下的业务文件
  → 依赖由模板固定，生成阶段基本不需要 install
```

理由：

- 从零生成整个工程慢、方差大、依赖不可控；
- 模板让构建和预览稳定，演示可控；
- 依赖固定后，快照与恢复成本也可预测。

代价：生成物形态受限，需要维护模板。

## 2. 模型基线（实测）

任务：单文件 `index.html` 任务看板（新增/完成/删除 + localStorage）
模型：`deepseek-v4.1-flash`（OpenCode Go）

| 指标 | 结果 |
|---|---|
| 成功 | 10/10 |
| 结构完整 | 10/10 |
| 平均耗时 | **136s**（106–180s） |
| 平均步数 | 3 |
| 平均 tokens | **39.7k** |

推论：

- 单文件都 136s，多文件 + 构建预计 3-5 分钟；
- 演示必须展示阶段进度，首个可见结果尽量在 60s 内；
- 建议演示"已完成项目 + 增量修改"，而不是现场从零生成。

## 3. 工具调用必须用真实模型验证

`MockLanguageModelV4` 在 AI SDK 7 下无法驱动工具调用：

| 写法 | 结果 |
|---|---|
| `tool-input-start` → `delta` → `end` | 不组装成 tool-call，工具不执行 |
| 直接 `tool-call`（input 字符串） | 能识别，但 `toolResults` 为 0，不触发下一步 |

mock 只适合验证：文本流、停止、持久化、多会话、续传。

## 4. UI 决策

| 项 | 决定 |
|---|---|
| 布局 | v1 两栏（对话 + 工作台 tabs）；≥1280 可放宽对话栏，窄屏底部切换。三栏 + Artifacts 是后续目标 |
| 组件 | AI Elements（vendored 源码，可直接改） |
| token | 语义色 + 补充字号 `text-2xs/3xs` + 布局宽度 `w-chat/w-side` |
| 硬编码 | 组件内禁止 hex / 任意值 / inline style |
| 代码高亮 | shiki 按需加载（3 语言 + 单主题），失败回退纯文本 |
| 本地化 | v1 直接写中文；`lib/i18n.ts` 消息表为后续目标 |
| 预览 | 示例应用必须响应式（预览面板宽度有限） |

## 5. 可观测性

> **v1 现状**：没有自建 `atoms_run_events` 表；当前依赖框架消息/工具调用记录和 Workers Logs。
> 下面是目标设计。

- 自建 `atoms_run_events`：`run_id / seq / type / at / data`。
- 记录 `run.started`、`model.finished`（含 usage）、`run.finished`、`run.failed`。
- PoC 实测按 runId 还原时间线 **18ms**。
- 生产环境接 `wrangler tail` / Workers Logs；敏感字段不落日志。

## 6. 后续验证（原待办，2026-11-20 更新）

- [x] `pnpm build` 生产构建已验证。
- [x] 真实 Vite 应用的生成 + 构建 + 预览闭环已验证。
- [x] 多文件生成的真实耗时/token 基线已记录（约 3 分钟，单次约 40k tokens 量级）。
- [ ] B6：`useAgent` 面板状态与对话并行尚未单独压测。
- [ ] 附件/R2、多角色、导出仍未接入。
