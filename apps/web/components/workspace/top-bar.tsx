"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Cpu, Pencil } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  configured,
  migrationActive,
  instanceTier,
  upgrading,
  upgradeError,
  onUpgrade,
  snapshotError,
  currentVersion,
  versionNote,
  onRename,
}: {
  /** Agent 运行状态（就绪 / 生成中 / 出错） */
  runState: RunState;
  projectId: string;
  projectName: string;
  template: string;
  runtime: string;
  configured: boolean;
  migrationActive: boolean;
  instanceTier: string;
  upgrading: boolean;
  upgradeError: string | null;
  onUpgrade: () => void;
  snapshotError: string | null;
  /** 当前版本；没有版本或加载失败时为 null，由 versionNote 兜底 */
  currentVersion: WorkspaceVersion | null;
  versionNote: string | null;
  onRename: (name: string) => Promise<void>;
}) {
  const run = runStateMeta[runState];
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(projectName);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const openRename = () => {
    setRenameValue(projectName);
    setRenameError(null);
    setRenameOpen(true);
  };

  const submitRename = async () => {
    const value = renameValue.trim();
    if (!value || renaming) return;
    setRenaming(true);
    setRenameError(null);
    try {
      await onRename(value);
      setRenameOpen(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : String(error));
    } finally {
      setRenaming(false);
    }
  };

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
        <button
          type="button"
          onClick={openRename}
          title="重命名项目"
          className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent"
        >
          <span className="truncate text-sm whitespace-nowrap text-foreground">
            {projectName}
          </span>
          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-60 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
        </button>
        <Badge variant="outline" className="hidden text-3xs font-normal sm:inline-flex">
          {configured ? templateLabel(template) : "待确认"}
        </Badge>
        {migrationActive ? (
          <Badge variant="secondary" className="text-3xs">
            迁移中
          </Badge>
        ) : null}
        <span className="hidden font-mono text-2xs whitespace-nowrap text-muted-foreground lg:inline">
          {projectId}
        </span>
      </div>

      <Badge
        variant="secondary"
        role="status"
        aria-live="polite"
        className="hidden gap-1.5 rounded-full font-normal whitespace-nowrap sm:inline-flex"
      >
        <span className={cn("size-1.5 rounded-full", run.dot)} />
        {run.label}
      </Badge>

      <div className="ml-auto flex items-center gap-1.5">
        {configured && runtime !== "browser" ? (
          <>
            {instanceTier !== "basic" ? (
              <Badge
                variant="outline"
                className="hidden font-mono text-3xs font-normal sm:inline-flex"
                title="当前容器实例"
              >
                {instanceTier}
              </Badge>
            ) : null}
            {instanceTier !== "standard-2" ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={upgrading || runState === "running"}
                onClick={() => setConfirmUpgrade(true)}
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
      </div>
      <Dialog open={confirmUpgrade} onOpenChange={setConfirmUpgrade}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>升级容器实例？</DialogTitle>
            <DialogDescription>
              将从 {instanceTier} 升到下一档，升级会先创建快照并重启容器。
              实例升级不可降级，可能影响当前计费。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmUpgrade(false)}
            >
              取消
            </Button>
            <Button
              className="gap-1.5"
              disabled={upgrading}
              onClick={() => {
                setConfirmUpgrade(false);
                onUpgrade();
              }}
            >
              <Cpu className="size-3.5" />
              确认升级
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setRenameError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
            <DialogDescription>
              只修改显示名称，不影响项目文件、版本和预览。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            maxLength={80}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRename();
              }
            }}
            placeholder="项目名称"
            autoFocus
          />
          {renameError ? (
            <p className="text-2xs text-destructive">{renameError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
            >
              取消
            </Button>
            <Button
              onClick={() => void submitRename()}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
