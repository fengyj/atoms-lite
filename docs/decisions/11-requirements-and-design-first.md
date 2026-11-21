# 11 · 需求 brief 与设计优先工作流

状态：**已实现**（2026-11-21）

## 决策

把「先确认需求，再可选看设计方向，最后实现」固化成 Agent 的默认工作流：

1. **需求确认**
   - 需求未确认前，Agent 不写生产代码、不生成设计稿。
   - Agent 用 `ask_user` 问清：目标用户、核心任务、必须内容、约束、成功标准、
     视觉方向、非目标；可以分多轮。
   - 需求足够清楚后调用 `manage_requirements(action=save)`，把结构化 brief 和 Markdown 摘要
     写入 `atoms_requirements`；再用 `ask_user` 给用户确认。
   - 用户确认后调用 `manage_requirements(action=confirm)`。未 confirmed 时
     `manage_design(action=create)` 直接拒绝。

2. **是否先看设计**
   - 需求 confirmed 后，Agent 必须询问用户，而不是自行决定：
     - 先看设计方向 → 生成概念页；
     - 直接实现 → 跳过设计；
     - 设计延后 → 先实现，之后可再要求设计。
   - 即使用户选择“先看设计”，如果需求仍有歧义，仍要先继续澄清。

3. **设计探索**
   - `manage_design(action=create)` 生成 2–3 个概念，默认 3 个；每个概念是独立静态 HTML，
     CSS 内联，真实文案和真实数据，响应式覆盖 360 / 768 / 1280，不依赖构建和外部资源。
   - 概念必须结构不同，不能只是换色；三个默认方向是：
     编排式日志（排版/留白）、工作台清单（密度/扫描）、触感摘要（色块/摘要图形）。
   - 每个方向单独调用一次模型，并行执行，`reasoningEffort=low`，24k 输出；
     HTML 控制在 100–160 行；硬超时 120s，失败时用精简提示重试一次（90s）。
   - 每完成一个方向就先写入 `atoms_designs`，用户不必等全部 3 个都完成。
   - 概念存入 `atoms_designs` / `atoms_design_files`，通过独立路由在 iframe 中预览；
     不启动容器。

4. **选择、批注与应用**
   - 工作台新增「设计」tab：只展示 Agent 生成的草案、桌面/移动预览、批注框、
     「让 Agent 微调」、「选择并继续」。生成/更新通过对话触发，面板里不放生成按钮；
     没有草案时只显示「还没有设计草案」。
   - 用户选择后 `manage_design(action=select)` 把 `design_status` 改为 `approved`；
     具体视觉反馈用 `manage_design(action=refine)` 只改当前方向。
   - `manage_design(action=apply)` 把该方向的 `design_md` 写入工作区 `DESIGN.md`，
     `design_status=applied`。主 Agent 之后必须读取 `DESIGN.md` 并遵守。
   - 后续 UI 反馈先生成变体（`mode: "revision"`），不直接大改生产代码。

5. **状态机**
   - `atoms_requirements.status`：`draft | confirmed`
   - `atoms_project_config.design_status`：`none | review | approved | applied`
   - `atoms_designs.status`：`draft | selected | applied`

## 理由

- **需求错位的成本最高**：先写代码再返工，比多问两轮贵得多。
- **设计稿比文字描述更容易对齐**：真实 HTML 概念页能在 30 秒内暴露信息层级、
  密度、视觉语气的问题；同一套布局换色没有比较价值。
- **概念页不需要构建**：静态 HTML 存 DO SQLite，Worker 直接服务，打开快；
  也避免为了看设计稿启动容器。
- **主 Agent / Designer / Tools 分工**：主 Agent 负责和用户沟通、做最终决策；
  Designer 只做创意探索；工具负责状态、预览、选择和应用。避免一个 Agent 同时
  扮演需求方、设计师和实现者。

## 被否方案

- **只问一次需求就开写**：无法覆盖视觉方向、非目标、成功标准，返工率高。
- **把设计做成“选配色主题”**：用户无法判断布局和信息层级，价值低。
- **让 Designer 直接改生产代码**：概念稿会污染工作区、版本和构建；Designer 只输出
  独立静态 HTML。
- **设计稿存容器**：为了看设计稿启动容器，慢且浪费；DO SQLite + Worker 服务足够。
- **一次模型调用生成 3 个完整概念**：输出容易超过上限，一个方向写太长会导致整体截断；
  改为每个方向一次调用，失败可重试，单个失败不影响其他方向。
- **强制所有项目都走设计稿**：有些用户只想快速实现；设计必须是可选项。

## 影响 / 待办

- 新增 WorkspaceDO 表：`atoms_requirements`、`atoms_designs`、`atoms_design_files`；
  `atoms_project_config` 新增 `design_status`、`design_id`。
- 新增 WorkspaceDO 路由：`/requirements`、`/requirements/confirm`、`/designs`、
  `/designs/:id/select|apply|update|detail`、`/designs/:id/*`。
- 新增 Agent 工具：`manage_requirements`、`manage_design`。
- 新增 `designer` usage source，单独记账。
- 工作台新增「设计」tab 和 `DesignPanel`；`workspace.tsx` 监听需求/设计工具结果自动刷新。
- 后续可选增强：需求确认卡（替代 `ask_user` 的纯文本确认）、设计稿版本历史、
  将多个变体并排对比、导出 DESIGN.md。
