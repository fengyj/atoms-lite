"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-2xs text-destructive",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words leading-5">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-destructive/10"
        >
          <RefreshCw className="size-3" />
          重试
        </button>
      ) : null}
    </div>
  );
}
