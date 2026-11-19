"use client";

import Link from "next/link";
import { ChevronLeft, Cpu, Download } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatClock,
  shortCommit,
  templateLabel,
  type WorkspaceVersion,
} from "@/lib/agent";

export type RunState = "idle" | "running" | "error";

const runStateMeta: Record<RunState, { dot: string; label: string }> = {
  idle: { dot: "bg-success", label: "空闲" },
  running: { dot: "animate-pulse bg-primary", label: "生成中" },
  error: { dot: "bg-destructive", label: "出错" },
};

export function TopBar({
  runState,
  projectId,
  projectName,
  template,
  runtime,
  instanceTier,
  upgrading,
  upgradeError,
  onUpgrade,
  snapshotError,
  currentVersion,
  versionNote,
}: {
  /** Agent 运行状态（就绪 / 生成中 / 出错） */
  runState: RunState;
  projectId: string;
  projectName: string;
  template: string;
  runtime: string;
  instanceTier: string;
  upgrading: boolean;
  upgradeError: string | null;
  onUpgrade: () => void;
  snapshotError: string | null;
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
          <BrandMark className="size-3.5" />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight whitespace-nowrap sm:inline">
          atoms-lite
        </span>
      </Link>

      <span className="text-border">/</span>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm whitespace-nowrap text-foreground">
          {projectName}
        </span>
        <Badge variant="outline" className="hidden text-3xs font-normal sm:inline-flex">
          {templateLabel(template)} · {runtime === "browser" ? "Browser" : "Container"}
        </Badge>
        <span className="hidden font-mono text-2xs whitespace-nowrap text-muted-foreground lg:inline">
          {projectId}
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
        {runtime !== "browser" ? (
          <>
            <Badge
              variant="outline"
              className="hidden font-mono text-3xs font-normal sm:inline-flex"
              title="当前容器实例"
            >
              {instanceTier}
            </Badge>
            {instanceTier !== "standard-2" ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={upgrading || runState === "running"}
                onClick={onUpgrade}
                title="升级实例（不可降级）"
              >
                <Cpu className="size-3.5" />
                <span className="hidden lg:inline">
                  {upgrading ? "升级中…" : "升级"}
                </span>
              </Button>
            ) : null}
            {upgradeError ? (
              <Badge
                variant="destructive"
                className="hidden text-3xs sm:inline-flex"
                title={upgradeError}
              >
                实例升级失败
              </Badge>
            ) : null}
          </>
        ) : null}
        {currentVersion ? (
          <>
            <Badge
              variant="outline"
              className="font-mono text-2xs font-normal"
              title={currentVersion.id}
            >
              {shortCommit(currentVersion.gitCommit)}
            </Badge>
            {currentVersion.status === "failed" || snapshotError ? (
              <Badge
                variant="destructive"
                className="text-3xs"
                title={snapshotError ?? undefined}
              >
                快照失败
              </Badge>
            ) : null}
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
      </div>
    </header>
  );
}
