# 08. 品牌图标与生成项目的图标库

## 1. atoms-lite 品牌图标

标记由三个元素组成：

- **两条交叉椭圆轨道**：表示原子/轨道，也暗示“生成、循环、组合”。
- **中心原子核**：视觉重心，小尺寸下仍能定位。
- **右上电子点**：打破对称，让标记在 16px 下仍有方向感。

主色使用应用 `--primary`（periwinkle），字形用近黑色 `#151824`；
在暗色界面上以主色圆角方块承载，保证标签页 favicon 与页内 logo 一致。

| 文件 | 用途 |
| --- | --- |
| `apps/web/app/icon.svg` | 浏览器 favicon / 搜索结果图标（Next 文件约定自动注入） |
| `apps/web/app/apple-icon.png` | iOS 主屏图标（180×180，满幅背景，由 iOS 自行裁圆角） |
| `apps/web/components/brand-mark.tsx` | 页内品牌标记（`currentColor`，外框由调用方控制） |

使用规则：

- 页内只使用 `BrandMark`，不要复制 SVG；外框保持 `bg-primary text-primary-foreground`。
- 最小尺寸 16px；小于 16px 时只用主色方块，不放字形。
- 不拉伸、不改轨道角度、不给标记叠加阴影或渐变文字。

## 2. 生成 Web 项目时的图标库

**默认选择：`lucide-react`**，并已预装在 React / 全栈模板中。

理由：

- shadcn/ui 的默认图标集，和现有组件、`currentColor`、`size-*` 类完全一致。
- 每个图标是独立 React 组件，Vite 构建可 tree-shake，只打包实际 import 的图标。
- 统一 24×24 网格、2px 描边、圆角端点，风格中性，适合工具型界面。
- 图标数量足够（常见操作、文件、媒体、导航、状态），命名直观。

模板约定：

```tsx
import { Camera, Search, Trash2 } from "lucide-react";

<Search className="size-4 text-muted-foreground" />
```

- 只 import 用到的图标；尺寸优先 `size-4` / `size-5`，颜色继承 `currentColor`。
- 一个应用只使用一套图标家族；不要混用 lucide + 其它线性图标。
- 功能图标不要用 emoji 代替；emoji 只用于文案表达。
- 品牌 logo、第三方平台标志不要硬凑 lucide，使用官方 SVG（内联或 `simple-icons`）。

### 备选

| 图标库 | 适合场景 | 注意 |
| --- | --- | --- |
| `lucide-react` | 默认；shadcn/ui、工具型界面 | 风格较统一、偏细线 |
| `@phosphor-icons/react` | 需要 6 种字重、更活泼的产品 | 体积与 API 不同于 lucide，需统一 `weight` |
| `@tabler/icons-react` | 需要大量 outline + filled 成对图标 | 图标数量多，注意只 import 子路径 |
| `react-icons` | 需要同时用多个图标家族（如 Font Awesome、Material） | 容易误 import 整包，包体不可控，非必要不用 |
| `@radix-ui/react-icons` | 极简 15×15 工具界面 | 尺寸体系与 lucide 不同，混用会不一致 |
| `simple-icons` | 品牌 / 社交平台 logo | 只有品牌标志，不适合做通用 UI 图标 |

不推荐在生成项目中使用图标字体（Font Awesome CDN 等）：加载阻塞、无 tree-shaking、
和 React 组件模型不一致，离线预览也不稳定。

### browser-static 运行时

浏览器静态模板没有 React，也默认不引入图标库：

- 少量图标直接内联 SVG：`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、
  `stroke-width="2"`、`stroke-linecap="round"`。
- 需要大量图标时才 `install_packages("lucide")`，用其 vanilla `createIcons`；
  这会加载整套图标，优先内联 SVG。
- 同样禁止 emoji 充当功能图标和图标字体。

## 3. 落地位置

- Prompt：`apps/worker/src/prompt.ts` 的 React / 全栈 / 静态模板段落。
- 模板依赖：`apps/worker/container/templates/*/package.json` 已包含 `lucide-react`。
- 站内品牌：`apps/web/app/icon.svg`、`apps/web/app/apple-icon.png`、
  `apps/web/components/brand-mark.tsx`。
