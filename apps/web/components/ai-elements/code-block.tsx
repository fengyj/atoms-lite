"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { highlightCode } from "@/lib/highlight";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
};

/**
 * 代码块：先渲染纯文本，shiki 按需加载完成后再替换为高亮版本。
 * 高亮失败时保留纯文本，内容始终可见。
 */
export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
}: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);

    highlightCode(code, language ?? "tsx").then((result) => {
      if (!cancelled) setHtml(result);
    });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

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

      <div className="overflow-auto scrollbar-thin">
        {html ? (
          <div
            className="[&_code]:font-mono [&_code]:text-sm [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-4 [&_pre]:text-sm"
            // shiki 生成的 HTML 由库产出，不是用户输入
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="m-0 p-4 font-mono text-sm leading-6">
            <code className="font-mono text-sm">{display}</code>
          </pre>
        )}
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
