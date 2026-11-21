"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Cpu, Gauge, Pencil } from "lucide-react";
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
  type ProjectUsage,
  type UsageTotals,
  type WorkspaceVersion,
} from "@/lib/agent";

export type RunState = "idle" | "running" | "error";

const runStateMeta: Record<RunState, { dot: string; label: string }> = {
  idle: { dot: "bg-success", label: "空闲" },
  running: { dot: "animate-pulse bg-primary", label: "生成中" },
  error: { dot: "bg-destructive", label: "出错" },
};

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function formatCost(value: number | null): string {
  if (value === null) return "未配置价格表";
  if (value === 0) return "$0";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
}

function UsageBlock({ title, totals }: { title: string; totals: UsageTotals }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>{title}</span>
        <span className="font-mono">{formatTokens(totals.totalTokens)} tokens</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs text-muted-foreground">
        <span>输入</span>
        <span className="text-right font-mono">
          {totals.inputTokens.toLocaleString()}
        </span>
        <span>输出</span>
        <span className="text-right font-mono">
          {totals.outputTokens.toLocaleString()}
        </span>
        <span>缓存命中</span>
        <span className="text-right font-mono">
          {totals.cacheReadTokens.toLocaleString()}
        </span>
        <span>缓存写入</span>
        <span className="text-right font-mono">
          {totals.cacheWriteTokens.toLocaleString()}
        </span>
        <span>请求 / 费用</span>
        <span className="text-right font-mono">
          {totals.requests} · {formatCost(totals.costUsd)}
        </span>
      </div>
    </div>
  );
}

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
  usage,
  usageLoading,
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
  usage: ProjectUsage | null;
  usageLoading: boolean;
  onRename: (name: string) => Promise<void>;
}) {
  const run = runStateMeta[runState];
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-t-4 border-border border-t-brand bg-background/95 px-4">
      <Link
        href="/"
        title="返回工作台"
        className="flex items-center gap-2 rounded-full px-1 py-0.5 transition-colors hover:bg-accent"
      >
        <ChevronLeft className="size-3 text-muted-foreground sm:hidden" />
        <span className="grid size-7 place-items-center rounded-full bg-foreground text-background">
          <BrandMark className="size-3.5" />
        </span>
        <span className="hidden font-serif text-lg font-medium tracking-tight whitespace-nowrap sm:inline">
          atoms-lite
        </span>
      </Link>

      <span className="text-muted-foreground/40">/</span>

      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={openRename}
          title="重命名项目"
          className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent"
        >
          <span className="truncate font-serif text-lg font-medium tracking-tight whitespace-nowrap text-foreground">
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
        <span className="hidden font-mono text-3xs whitespace-nowrap text-muted-foreground lg:inline">
          {projectId}
        </span>
      </div>

      <Badge
        variant="secondary"
        role="status"
        aria-live="polite"
        className="hidden gap-1.5 rounded-full border border-border bg-transparent font-normal whitespace-nowrap sm:inline-flex"
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
                className="gap-1.5 rounded-full"
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
        {usage ? (
          <button
            type="button"
            onClick={() => setUsageOpen(true)}
            title={`本会话输入 ${usage.session.inputTokens.toLocaleString()} · 输出 ${usage.session.outputTokens.toLocaleString()} · 缓存命中 ${usage.session.cacheReadTokens.toLocaleString()}`}
            className="hidden items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-accent lg:inline-flex"
          >
            <Gauge className="size-3" />
            <span>{formatTokens(usage.session.totalTokens)} tokens</span>
            {usage.session.cacheReadTokens > 0 ? (
              <span className="text-muted-foreground/60">
                · 缓存 {formatTokens(usage.session.cacheReadTokens)}
              </span>
            ) : null}
          </button>
        ) : usageLoading ? (
          <span className="hidden text-2xs text-muted-foreground lg:inline">
            用量加载中
          </span>
        ) : null}
        {currentVersion ? (
          <>
            {currentVersion.published ? (
              <Badge
                variant="outline"
                className="hidden border-success/40 bg-success/10 text-3xs text-success sm:inline-flex"
              >
                已发布
              </Badge>
            ) : null}
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
      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Token 用量</DialogTitle>
            <DialogDescription>
              按模型请求累计；缓存命中属于输入 token 明细。费用按内置价格估算，
              可用 MODEL_PRICING_JSON 覆盖。
            </DialogDescription>
          </DialogHeader>
          {usage ? (
            <div className="space-y-3">
              <UsageBlock title="本会话" totals={usage.session} />
              <UsageBlock title="今日本项目" totals={usage.today} />
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>今日全站</span>
                  <span className="font-mono">
                    {formatTokens(usage.systemToday.totalTokens)} tokens
                  </span>
                </div>
                {usage.limit.dailyCostUsd > 0 ? (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{
                          width: `${Math.min(
                            100,
                            (usage.limit.usedCostUsd /
                              usage.limit.dailyCostUsd) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-2xs text-muted-foreground">
                      ${usage.limit.usedCostUsd.toFixed(4)} / $
                      {usage.limit.dailyCostUsd.toFixed(2)}
                      {usage.limit.allowed
                        ? " · 仍在额度内"
                        : " · 已达今日上限"}
                    </p>
                    <p className="mt-0.5 text-2xs text-muted-foreground/70">
                      预留 ${usage.limit.reserveCostUsd.toFixed(2)}{" "}
                      防止单轮透支；剩余约 $
                      {usage.limit.remainingCostUsd.toFixed(4)}
                    </p>
                  </>
                ) : usage.limit.dailyTokens > 0 ? (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{
                          width: `${Math.min(
                            100,
                            (usage.limit.usedTokens /
                              usage.limit.dailyTokens) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {formatTokens(usage.limit.usedTokens)} /{" "}
                      {formatTokens(usage.limit.dailyTokens)}
                      {usage.limit.allowed
                        ? " · 仍在额度内"
                        : " · 已达今日上限"}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-2xs text-muted-foreground">
                    未设置每日上限
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">用量加载中…</p>
          )}
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
