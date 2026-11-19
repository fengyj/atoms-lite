"use client";

import { useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TemplateId } from "@/lib/agent";

const LABELS: Record<TemplateId, string> = {
  static: "Static",
  "react-vite": "React",
  "fullstack-hono": "全栈",
};

export function SwitchRuntimeCard({
  template,
  currentTemplate,
  reason,
  onConfirm,
  onCancel,
}: {
  template: TemplateId;
  currentTemplate?: TemplateId;
  reason: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
          <RefreshCw className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">需要切换运行环境</p>
          <p className="mt-1 text-2xs leading-4 text-muted-foreground">
            {reason}
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-2xs text-muted-foreground">
            <span>{currentTemplate ? LABELS[currentTemplate] : "当前环境"}</span>
            <ArrowRight className="size-3" />
            <Badge variant="secondary" className="text-3xs">
              {LABELS[template]}
            </Badge>
          </p>
          <p className="mt-1 text-3xs leading-4 text-muted-foreground/80">
            现有文件会备份到迁移目录，旧 git 历史可能不再可检出；切换不可降级到更小的环境。
          </p>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-2xs text-destructive">{error}</p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          切换并迁移
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
