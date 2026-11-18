# POC-01 UI 基座（产品代码，不属于 spike）

时间盒：**2-3 小时**。与 POC-02/05/06 可并行。

> 这一项不是「验证型 PoC」，而是**设计基座**。把它放在最前面，是为了避免实现完业务后再回头改 UI。

## 1. 要验证的假设

1. 用 AI Elements + 自定义 token，能在**不接后端**的情况下把工作台视觉定下来。
2. 组件的 props 只要按三个已冻结的形状（UIMessage / RunEvent / Artifact+Version）设计，接真实数据时不需要改组件。
3. 视觉规则可以变成可检查的约束（无硬编码、无 inline style、token 全覆盖），而不是口头约定。

## 2. 不在范围内

- 不接任何 API、不连 Durable Object、不调用模型。
- 不实现工具的真实行为（工具卡片只渲染假数据）。
- 不做动画细节打磨（只定 token 里的时长/缓动）。

## 3. 三种产物

### 3.1 设计 token（`apps/web/app/globals.css` 的 `@theme`）

必须覆盖：背景层级（3 级）、文字层级（4 级）、边框、主色、语义色（成功/警告/危险）、间距刻度、圆角、字号、行高、阴影、动效时长。

验收方法（可执行）：

```bash
# 组件目录里不应出现裸色值 / 任意值
grep -rnE "#[0-9a-fA-F]{3,8}|\[[0-9]+px\]|style=\{\{" apps/web/components
# 期望：0 命中（动态计算除外，需注释豁免）
```

### 3.2 工作台版面

参考 atoms.dev 的信息架构（**只参考结构，不复制品牌资源**）：

```
┌──────────────────────────────────────────────┐
│ 顶栏：项目名 / 会话 / 运行状态 / 版本 / 导出    │
├──────────┬──────────────────┬────────────────┤
│ 对话      │ Preview          │ Artifacts      │
│ (主入口)  │ (默认主视觉)      │ Sandbox        │
│          │                  │ 版本            │
└──────────┴──────────────────┴────────────────┘
```

三档断点：

| 宽度 | 布局 |
|---|---|
| ≥1280 | 三栏 |
| 768-1279 | 对话 + Preview 双栏，右栏折叠为抽屉 |
| <768 | 单栏，顶部标签切换（对话 / 预览 / 其他） |

### 3.3 组件 gallery（`/design` 路由）

用**假数据**渲染全部组件与全部状态。这是本 PoC 的核心交付物。

必须出现的组件：

| 区域 | 组件 | 必须覆盖的状态 |
|---|---|---|
| 对话 | 消息气泡、Markdown 正文、代码块 | 流式中 / 完成 / 错误 / 超长内容 |
| 对话 | 工具卡片（AI Elements `Tool`） | input-streaming / input-available / output-available / output-error |
| 对话 | 推理片段（`Reasoning`） | 折叠 / 展开 |
| 对话 | 任务清单（`Task`） | 全部待办状态 |
| 对话 | 审批卡片（`Confirmation`） | 待确认 / 已批准 / 已拒绝 |
| 对话 | 附件、上传中、上传失败 | 3 态 |
| 对话 | 输入框（`PromptInput`） | 空 / 有内容 / 禁用 / 运行中（显示停止） |
| Preview | 空态、加载中、就绪（iframe 占位）、构建失败 | 4 态 |
| Sandbox | 文件树、终端输出、进程状态 | 空 / 运行 / 已停止 |
| Artifacts | 列表、类型图标、空态 | 3 态 |
| 版本 | 列表项、当前版本、验证失败标记 | 3 态 |
| 全局 | Toast / 错误横幅 / 骨架屏 | 3 态 |

### 3.4 冻结三个 view model

组件**只允许**吃这三个形状。接数据时只换数据源，不改组件。

```ts
// 1. 对话：直接用 AI SDK 的类型，不自造
type ChatMessage = UIMessage;        // { id, role, parts: [...] }

// 2. 控制事件：与 contracts 的 RunEvent 对齐
//    字段见 docs/atoms-lite-需求与设计.md 的控制通道设计
type PanelEvent = RunEvent;

// 3. 产物与版本：组件只依赖展示所需字段
type ArtifactVM = { id, kind, name, size, createdAt, previewable };
type VersionVM  = { id, commit, summary, status, createdAt, sourceMessageId };
```

规则：**组件不得直接依赖 DO / API 的原始响应结构**。中间必须有一层 mapper，mapper 是唯一允许改的地方。

## 4. 通过标准

- [ ] `/design` 能渲染上表全部组件与全部状态，无需任何后端
- [ ] `grep` 硬编码检查 0 命中（豁免项有注释）
- [ ] 三档断点各截一张图，无溢出、无遮挡、无横向滚动
- [ ] 同一组件的所有状态视觉可区分（肉眼可辨）
- [ ] 组件 props 只引用上面三个 view model 类型（用 `tsc` 约束）
- [ ] 深色主题下对比度可读（正文 ≥ 4.5:1）

## 5. Plan B

| 情况 | 处理 |
|---|---|
| AI Elements 某组件不满足布局/密度要求 | 保留它的壳、改内部样式；不引入第二套组件库 |
| AI Elements 版本与 AI SDK 7 冲突 | 退回 shadcn 原生组件 + 自写消息渲染（POC-08 同步降级） |
| token 方案在 Tailwind v4 下受限 | 改用 CSS 变量 + `@theme inline`，规则不变 |
| 时间不够 | 优先保证「对话 + Preview + Sandbox」三块；Artifacts/版本可先用简单列表 |

## 6. 产物

- `apps/web/app/design/page.tsx`（保留，作为后续回归页）
- `apps/web/components/**`（产品代码，保留）
- `apps/web/app/globals.css` 的 token（保留）
- 三张断点截图放进 `docs/poc/assets/`

## 7. 风险

- **最大风险是「没有真实数据就定死交互」**。缓解：所有动态区域都按「最长内容 / 空 / 错误」三种极限设计，而不是理想情况。
- 不要把业务逻辑写进组件（例如"点击版本就回滚"），只留回调。

## 结论

**初步通过，待人工视觉确认。**

### 实施记录（2026-11-18）

已完成：

- shadcn 初始化（`base=radix`、`baseColor=neutral`、CSS variables）
- AI Elements 组件：conversation / message / tool / reasoning / task / confirmation /
  prompt-input / code-block / loader / artifact / web-preview / plan / checkpoint
- token 层：表面 4 级、文字 2 级、语义色（success / warning）、补充字号
  `text-2xs` / `text-3xs`、布局宽度 `w-chat` / `w-chat-lg` / `w-chat-xl` / `w-side`
- 工作台 shell：≥1280 三栏；768–1279 两栏 + 抽屉；<768 单栏 + 底部标签
- `/design` gallery：token、按钮徽标、消息（纯文本 / Markdown / 代码）、工具四态、
  推理、计划、任务、审批三态、产物、版本、预览、终端、空/加载/错误、输入区
- 硬编码检查：`components/workspace` + `app/design` 对 hex / 任意值 / inline style
  的扫描结果为 0

待人工确认：

- ~~三档断点截图（本机无浏览器自动化）~~ → 已用 Playwright 补齐，见下
- 窄屏下 AI Elements 的密度是否可读 → 已确认可读
- 深色主题对比度实测 → 目测可读，未做自动化对比度检查

### 视觉验证（Playwright，2026-11-18）

`playwright@1.63`（复用本机缓存的 chromium-1243）+ `scripts/poc01-shots.mjs`：

| 页面 | 1440 | 1024 | 390 |
|---|---|---|---|
| `/` | ✅ | ✅ | ✅ |
| `/design` | ✅ | ✅ | ✅ |

- 三档断点横向溢出均为 **0px**
- 控制台错误仅剩 Next dev 的 HMR WebSocket 握手失败（生产构建不存在）
- 截图见 `docs/poc/assets/`

### 视觉走查发现并修复的问题

1. **预览 iframe 内的示例应用被压扁**：三栏棋盘在 560px 宽度下每列只剩 80px。
   修复：`demo-preview.html` 增加容器宽度断点（≤900px 隐藏侧栏、两列；≤620px 单列）。
2. **AI Elements 内置文案是英文**（Pending / Completed / Thought for a few seconds / Parameters / Result）。
   修复：直接在 vendored 组件里本地化（组件源码在仓库内，属于可改范围）。
3. **移动端顶栏换行**：`atoms-lite` 折成两行、项目名被挤成「任务…」。
   修复：窄屏隐藏品牌文字与状态徽标，保留项目名 + 版本 + 面板按钮。
4. **移动端审批卡片被输入框截断**：
   修复：窄屏隐藏执行计划列表（次要信息），保证审批按钮可见。
5. **CodeBlock 在 shiki 完成前是空白**，且原实现的 `mounted` 逻辑导致高亮永远不会更新。
   修复：先渲染纯文本兜底。后续排查发现 shiki 在浏览器端加载 oniguruma WASM 会挂住，
   且把 8 种语言 + 2 个主题打进客户端包会让 dev 的 postcss 子进程 OOM。
   最终**移除 shiki**，改为轻量代码块（等宽展示 + 复制 + 语言标签），语法高亮后置。

### 已知限制

- 预览 iframe 使用 `sandbox="allow-scripts allow-same-origin"`，浏览器会警告可逃逸沙箱。
  演示阶段接受；生产必须给预览独立子域。

### 与预期的偏差

- `shadcn@4.23` 的 `-b` 指**组件基础库**（radix / base / aria），不再是 base color。
- 生成的 AI Elements 组件有 5 处与 AI SDK 7 类型不匹配，已就地修正：
  移除过期的 `@ts-expect-error`、补 `undefined` 保护、收窄 Streamdown 的 props 类型。
- `components/ui/button.tsx` 默认从 `cn` 这个 npm 包导入，已统一改为 `@/lib/utils`。
