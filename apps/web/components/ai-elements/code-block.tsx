"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
};

/**
 * 轻量代码块：只做等宽展示 + 复制。
 *
 * 之前用 shiki 做高亮，但它在浏览器端加载 oniguruma WASM 时会挂住，
 * 且把 8 种语言 + 2 个主题打进客户端包，dev 下直接把 postcss 子进程打到 OOM。
 * 演示阶段先保证「内容可见、可复制」，高亮后续用按需动态加载再补。
 */
export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
}: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const display = showLineNumbers
    ? code
        .split("\n")
        .map((line, i) => `${String(i + 1).padStart(2, " ")}  ${line}`)
        .join("\n")
    : code;

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-md border border-border bg-background",
        className
      )}
    >
      {language ? (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-3xs tracking-wide text-muted-foreground uppercase">
            {language}
          </span>
        </div>
      ) : null}
      <div className="overflow-auto">
        <pre className="m-0 p-4 font-mono text-sm leading-6">
          <code className="font-mono text-sm">{display}</code>
        </pre>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="复制代码"
        className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // 剪贴板不可用时静默失败
          }
        }}
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
};
