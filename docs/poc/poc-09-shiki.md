# POC-09 shiki 按需加载

时间盒：30-45 分钟。依赖：无。

## 1. 要验证的假设

1. `createHighlighterCore` + `createJavaScriptRegexEngine` 能绕开浏览器端 oniguruma WASM 挂起。
2. 通过动态 `import()` 只带 2-3 种语言 + 单主题，不会把客户端包撑爆、不触发 dev OOM。
3. 首次渲染用纯文本兜底，高亮完成后替换，用户不会看到空白。

## 2. 做法

- `apps/web/lib/highlight.ts`：懒加载单例，所有 shiki 依赖都在函数体内 `await import()`。
- 只带 `tsx` / `json` / `bash` + `one-dark-pro` 单主题。
- `CodeBlock`：先渲染 `<pre>` 纯文本，`useEffect` 里异步高亮，成功后替换为 shiki HTML；失败保持纯文本。

## 3. 通过标准与结果

| 标准 | 结果 |
|---|---|
| 2 秒内出高亮 | ✅ **103–257ms**（5 次） |
| 连续 5 次刷新不 OOM / 不 500 | ✅ 全部 200，内存稳定 |
| shiki 不进首屏 chunk | ✅ 动态 import，挂载后才加载 |
| 加载失败时内容仍可见 | ✅ 纯文本兜底，`catch` 返回 null |
| 高亮 token 数 | ✅ 单个代码块 26 个带色 span；`/design` 共 5 块 / 56 个 |

## 4. 与上次失败的区别

| 上次 | 这次 |
|---|---|
| 静态 `import { codeToHtml } from "shiki"` | 全部动态 import |
| 默认 oniguruma WASM 引擎 | JS 正则引擎 |
| 8 语言 + 2 主题 | 3 语言 + 1 主题 |
| 结果：挂起 + dev postcss OOM | 结果：稳定 |

## 5. Plan B（未触发）

| 失败点 | 降级 |
|---|---|
| 仍然挂起 | 换 `highlight.js`（无 WASM，~30KB） |
| 体积不可接受 | 只高亮 `tsx`，JSON 保持纯文本 |
| 高亮影响首屏 | 用 `requestIdleCallback` 延迟到空闲时再加载 |

## 6. 已知限制

- 只覆盖三种语言；其他语言回退到 tsx 语法着色（颜色语义会有偏差）。
- 主题固定为暗色，应用本身也是暗色，暂不需要切换。
- shiki 是运行时依赖（但只在需要时下载）。

## 结论

**通过。** 已并入 `CodeBlock`，并删除临时页 `/poc-shiki`。
