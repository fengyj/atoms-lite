"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ToolUIPart, UIMessage } from "ai";
import {
  FileText,
  Folder,
  FolderTree,
  History,
  Loader2,
  Package,
  RotateCw,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/workspace/panel";
import {
  formatClock,
  formatSize,
  shortCommit,
  type Endpoint,
  type WorkspaceFileEntry,
  type WorkspaceFileListing,
  type WorkspaceVersion,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

/** 路径深度 → 缩进（沿用树形视觉，不用任意值） */
const INDENT = ["pl-1.5", "pl-5", "pl-8", "pl-11"] as const;
const MAX_INDENT = "pl-11";

function indent(depth: number): string {
  return INDENT[depth] ?? MAX_INDENT;
}

function isDirectory(entry: WorkspaceFileEntry): boolean {
  return entry.type === "dir" || entry.type === "directory";
}

/** 版本状态 → 展示（未知状态原样显示，不假装认识） */
function versionStatus(status: string): { label: string; tone: string } {
  if (status === "verified") {
    return {
      label: "已验证",
      tone: "bg-success/15 text-success border-success/30",
    };
  }
  if (status === "failed") {
    return {
      label: "失败",
      tone: "bg-destructive/15 text-destructive border-destructive/30",
    };
  }
  if (status === "draft") {
    return { label: "草稿", tone: "bg-muted text-muted-foreground border-border" };
  }
  return { label: status, tone: "bg-muted text-muted-foreground border-border" };
}

export function SidePanel({
  className,
  versions,
  files,
  messages,
}: {
  className?: string;
  /** 版本列表（真实请求；DO 存储，容器停止也能读） */
  versions: Endpoint<WorkspaceVersion[]>;
  /** 文件列表（默认读 DO 缓存；refreshLive 会启动容器） */
  files: Endpoint<WorkspaceFileListing>;
  /** 会话消息：从 exec 工具调用还原终端记录 */
  messages: UIMessage[];
}) {
  const terminal = useMemo(() => buildTerminal(messages), [messages]);

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      <Tabs defaultValue="sandbox" className="flex h-full min-h-0 flex-col gap-0">
        <div className="border-b border-border px-2 py-1.5">
          <TabsList className="h-8 w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="sandbox" className="gap-1.5 text-xs">
              <Terminal className="size-3.5" />
              Sandbox
            </TabsTrigger>
            <TabsTrigger value="artifacts" className="gap-1.5 text-xs">
              <Package className="size-3.5" />
              产物
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-1.5 text-xs">
              <History className="size-3.5" />
              版本
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="sandbox"
          className="mt-0 flex min-h-0 flex-1 flex-col"
        >
          <Tabs
            defaultValue="workspace"
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="border-b border-border px-2 py-1.5">
              <TabsList className="h-7 w-full justify-start gap-1 bg-transparent p-0">
                <TabsTrigger value="workspace" className="gap-1.5 text-2xs">
                  <FolderTree className="size-3.5" />
                  工作区
                </TabsTrigger>
                <TabsTrigger value="terminal" className="gap-1.5 text-2xs">
                  <Terminal className="size-3.5" />
                  终端
                  {terminal.length > 0 ? (
                    <span className="text-3xs text-muted-foreground">
                      {terminal.length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="workspace"
              className="mt-0 min-h-0 flex-1 overflow-auto p-2 scrollbar-thin"
            >
              <div className="mb-1.5 flex items-center justify-between px-1 text-2xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FolderTree className="size-3.5" />
                  /workspace
                </span>
                <span className="flex items-center gap-1.5">
                  <span>{files.data?.entries.length ?? 0} 个文件</span>
                  {files.data && !files.data.running ? (
                    <span
                      className="text-3xs text-warning"
                      title="当前来自 SQL 缓存；刷新会启动沙箱并同步"
                    >
                      缓存
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={files.refreshLive}
                    aria-label="同步文件列表"
                    title="同步文件（会启动沙箱）"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RotateCw
                      className={cn("size-3.5", files.loading && "animate-spin")}
                    />
                  </button>
                </span>
              </div>

              <StateRow
                loading={files.loading}
                error={files.error}
                onRetry={files.refresh}
              />

              {files.data ? (
                files.data.entries.length === 0 ? (
                  <p className="px-1 py-2 text-2xs leading-5 text-muted-foreground">
                    {files.data.cachedAt === 0
                      ? "文件缓存尚未建立；点击刷新会启动沙箱并同步。"
                      : "空工作区：还没有任何文件。"}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {files.data.entries.map((entry) => (
                      <FileRow key={entry.path} entry={entry} />
                    ))}
                  </ul>
                )
              ) : null}
            </TabsContent>

            <TabsContent
              value="terminal"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 items-center justify-between px-2 py-1.5 text-2xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Terminal className="size-3.5" />
                  Agent 命令记录
                </span>
                <span>{terminal.length} 条命令</span>
              </div>
              <TerminalLog entries={terminal} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent
          value="artifacts"
          className="mt-0 min-h-0 flex-1 overflow-auto scrollbar-thin"
        >
          <EmptyState
            title="暂无产物"
            hint="版本验证后会生成可下载的产物。"
          />
        </TabsContent>

        <TabsContent
          value="versions"
          className="mt-0 min-h-0 flex-1 overflow-auto p-2 scrollbar-thin"
        >
          <div className="mb-1.5 flex items-center justify-between px-1 text-2xs text-muted-foreground">
            <span>版本历史</span>
            <span className="flex items-center gap-1.5">
              <span>{versions.data?.length ?? 0} 个版本</span>
              <button
                type="button"
                onClick={versions.refresh}
                aria-label="刷新版本列表"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCw
                  className={cn("size-3.5", versions.loading && "animate-spin")}
                />
              </button>
            </span>
          </div>

          <StateRow
            loading={versions.loading}
            error={versions.error}
            onRetry={versions.refresh}
          />

          {versions.data ? (
            versions.data.length === 0 ? (
              <p className="px-1 py-2 text-2xs text-muted-foreground">
                还没有版本：让 Agent 完成一轮修改后自动创建。
              </p>
            ) : (
              <ul className="space-y-1.5">
                {versions.data.map((version) => (
                  <VersionRow key={version.id} version={version} />
                ))}
              </ul>
            )
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}

type ExecInput = { program?: string; args?: string[]; cwd?: string };
type ExecOutput = { exitCode?: number; stdout?: string; stderr?: string };

type TerminalEntry = {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  state: ToolUIPart["state"];
};

function quoteArg(arg: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

/** 从消息里的 exec 工具调用还原终端记录（只读展示，不执行命令）。 */
function buildTerminal(messages: UIMessage[]): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      const tool = part as ToolUIPart;

      if (part.type === "tool-build") {
        const output = (tool.output ?? {}) as {
          skipped?: boolean;
          exitCode?: number;
          stdout?: string;
          stderr?: string;
        };
        entries.push({
          id: tool.toolCallId,
          command: output.skipped ? "build（模板无需构建）" : "npm run build",
          stdout: output.stdout ?? "",
          stderr:
            output.stderr ??
            tool.errorText ??
            (typeof tool.output === "string" ? tool.output : ""),
          exitCode: typeof output.exitCode === "number" ? output.exitCode : null,
          state: tool.state,
        });
        continue;
      }

      if (part.type !== "tool-exec") continue;
      const input = tool.input as ExecInput | undefined;
      if (!input?.program) continue;

      const output = (tool.output ?? {}) as ExecOutput;
      entries.push({
        id: tool.toolCallId,
        command: [input.program, ...(input.args ?? [])]
          .map(quoteArg)
          .join(" "),
        stdout: output.stdout ?? "",
        stderr:
          output.stderr ??
          tool.errorText ??
          (typeof tool.output === "string" ? tool.output : ""),
        exitCode: typeof output.exitCode === "number" ? output.exitCode : null,
        state: tool.state,
      });
    }
  }

  return entries;
}

function TerminalLog({ entries }: { entries: TerminalEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const last = entries.at(-1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, last?.state]);

  return (
    <div className="min-h-0 flex-1 overflow-auto scrollbar-thin bg-background/70 px-2 pb-2 font-mono text-2xs">
      {entries.length === 0 ? (
        <p className="px-1 py-3 leading-5 text-muted-foreground">
          等待 Agent 执行命令…
          <br />
          所有 exec 调用会显示在这里。
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id}>
              <div className="flex items-start gap-1 text-foreground/90">
                <span className="select-none text-success">$</span>
                <span className="min-w-0 break-all">{entry.command}</span>
              </div>
              {entry.stdout ? (
                <pre className="mt-0.5 whitespace-pre-wrap break-all text-muted-foreground">
                  {entry.stdout.trimEnd()}
                </pre>
              ) : null}
              {entry.stderr ? (
                <pre className="mt-0.5 whitespace-pre-wrap break-all text-destructive">
                  {entry.stderr.trimEnd()}
                </pre>
              ) : null}
              <div className="mt-0.5 text-3xs text-muted-foreground/70">
                {entry.state === "output-available"
                  ? `exit ${entry.exitCode ?? 0}`
                  : "running…"}
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={bottomRef} />
      {entries.length > 0 ? (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-success">$</span>
          <span className="animate-pulse text-foreground">▍</span>
        </div>
      ) : null}
    </div>
  );
}

function FileRow({ entry }: { entry: WorkspaceFileEntry }) {
  const dir = isDirectory(entry);
  const depth = entry.path.split("/").length - 1;
  const Icon = dir ? Folder : FileText;

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded py-1 pr-1.5 text-xs hover:bg-accent",
        indent(depth)
      )}
      title={entry.path}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          dir ? "text-muted-foreground" : "text-foreground/80"
        )}
      >
        {entry.path}
      </span>
      <span className="text-3xs text-muted-foreground">
        {formatSize(entry.size)}
      </span>
    </li>
  );
}

function VersionRow({ version }: { version: WorkspaceVersion }) {
  const meta = versionStatus(version.status);

  return (
    <li
      className={cn(
        "rounded-md border px-2.5 py-2",
        version.current
          ? "border-primary/40 bg-primary/5"
          : "border-transparent hover:bg-accent"
      )}
      title={version.id}
    >
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs font-medium">
          {shortCommit(version.gitCommit)}
        </code>
        <span
          className={cn(
            "ml-auto rounded-full border px-1.5 py-0.5 text-3xs",
            meta.tone
          )}
        >
          {meta.label}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-2xs text-muted-foreground">
        {version.summary}
      </p>
      <div className="mt-1 flex items-center gap-2 text-3xs text-muted-foreground/70">
        <span>{formatClock(version.createdAt)}</span>
        {version.current ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-3xs">
            当前
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

/** 加载 / 失败的共用行；两者都没有时返回 null */
function StateRow({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex items-center justify-between gap-2 px-1 py-2 text-2xs text-destructive">
        <span className="min-w-0 truncate">加载失败：{error}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-1 py-2 text-2xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        加载中…
      </div>
    );
  }
  return null;
}
