"use client";

import { Download, PanelRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopBar({
  sideOpen,
  onToggleSide,
}: {
  sideOpen: boolean;
  onToggleSide: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-3">
      <div className="flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-3" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          atoms-lite
        </span>
      </div>

      <span className="text-border">/</span>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-foreground">任务看板</span>
        <span className="hidden text-2xs text-muted-foreground sm:inline">
          ses_8f21
        </span>
      </div>

      <Badge variant="secondary" className="gap-1.5 rounded-full font-normal">
        <span className="size-1.5 animate-pulse rounded-full bg-warning" />
        生成中 · 3/5
      </Badge>

      <div className="ml-auto flex items-center gap-1.5">
        <Badge variant="outline" className="font-mono text-2xs font-normal">
          v3
        </Badge>
        <span className="hidden text-2xs text-muted-foreground lg:inline">
          已保存 12:41
        </span>
        <Button variant="ghost" size="sm" className="hidden gap-1.5 sm:inline-flex">
          <Download className="size-3.5" />
          导出
        </Button>
        <Button
          variant={sideOpen ? "secondary" : "ghost"}
          size="icon-sm"
          className={cn("xl:hidden")}
          onClick={onToggleSide}
          aria-label="切换侧栏"
        >
          <PanelRight className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}
