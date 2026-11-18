"use client";

import Link from "next/link";
import { ChevronLeft, Download, PanelRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AGENT_SESSION,
  formatClock,
  shortCommit,
  type WorkspaceVersion,
} from "@/lib/agent";

export type RunState = "idle" | "running" | "error";

const runStateMeta: Record<RunState, { dot: string; label: string }> = {
  idle: { dot: "bg-success", label: "空闲" },
  running: { dot: "animate-pulse bg-primary", label: "生成中" },
  error: { dot: "bg-destructive", label: "出错" },
};

export function TopBar({
  sideOpen,
  onToggleSide,
  runState,
  currentVersion,
  versionNote,
}: {
  sideOpen: boolean;
  onToggleSide: () => void;
  /** Agent 运行状态（就绪 / 生成中 / 出错） */
  runState: RunState;
  /** 当前版本；没有版本或加载失败时为 null，由 versionNote 兜底 */
  currentVersion: WorkspaceVersion | null;
  versionNote: string | null;
}) {
  const run = runStateMeta[runState];

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-3">
      <Link
        href="/"
        title="返回工作台"
        className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-accent"
      >
        <ChevronLeft className="size-3 text-muted-foreground sm:hidden" />
        <span className="grid size-5 place-items-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-3" />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight whitespace-nowrap sm:inline">
          atoms-lite
        </span>
      </Link>

      <span className="text-border">/</span>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm whitespace-nowrap text-foreground">
          五子棋 Demo
        </span>
        <span className="hidden text-2xs whitespace-nowrap text-muted-foreground sm:inline">
          session {AGENT_SESSION}
        </span>
      </div>

      <Badge
        variant="secondary"
        className="hidden gap-1.5 rounded-full font-normal whitespace-nowrap sm:inline-flex"
      >
        <span className={cn("size-1.5 rounded-full", run.dot)} />
        {run.label}
      </Badge>

      <div className="ml-auto flex items-center gap-1.5">
        {currentVersion ? (
          <>
            <Badge
              variant="outline"
              className="font-mono text-2xs font-normal"
              title={currentVersion.id}
            >
              {shortCommit(currentVersion.gitCommit)}
            </Badge>
            <span className="hidden text-2xs text-muted-foreground lg:inline">
              已保存 {formatClock(currentVersion.createdAt)}
            </span>
          </>
        ) : versionNote ? (
          <span className="hidden text-2xs text-muted-foreground sm:inline">
            {versionNote}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 sm:inline-flex"
          disabled
          title="导出功能即将开放"
        >
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
