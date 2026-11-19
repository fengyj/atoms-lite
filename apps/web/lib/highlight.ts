/**
 * POC-09：按需加载 shiki。
 *
 * 约束：
 * - 只能通过动态 import 引入，避免进入首屏 chunk；
 * - 只用 JS 正则引擎，避免 oniguruma WASM 在 Next/Turbopack 下挂起；
 * - 按需带常用源码/样式/文档语言 + 单主题（应用是纯暗色）。
 */
import type { HighlighterCore } from "shiki/core";

const LANGS = [
  "tsx",
  "typescript",
  "javascript",
  "jsx",
  "json",
  "bash",
  "css",
  "html",
  "markdown",
  "yaml",
] as const;
type SupportedLang = (typeof LANGS)[number];

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      tsx,
      typescript,
      javascript,
      jsx,
      json,
      bash,
      css,
      html,
      markdown,
      yaml,
      theme,
    ] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/langs/tsx.mjs"),
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/jsx.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/bash.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/markdown.mjs"),
      import("shiki/langs/yaml.mjs"),
      import("shiki/themes/one-dark-pro.mjs"),
    ]);

    return createHighlighterCore({
      themes: [theme.default],
      langs: [
        tsx.default,
        typescript.default,
        javascript.default,
        jsx.default,
        json.default,
        bash.default,
        css.default,
        html.default,
        markdown.default,
        yaml.default,
      ],
      engine: createJavaScriptRegexEngine(),
    });
  })();

  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  language: string,
): Promise<string | null> {
  const lang: SupportedLang = (LANGS as readonly string[]).includes(language)
    ? (language as SupportedLang)
    : "tsx";

  try {
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, {
      lang,
      theme: "one-dark-pro",
    });
  } catch {
    // 高亮失败不影响代码可见性（调用方保留纯文本兜底）
    return null;
  }
}
