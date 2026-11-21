"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolUIPart, UIMessage } from "ai";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  History,
  Loader2,
  Monitor,
  RotateCw,
  Terminal,
  ExternalLink,
  Rocket,
  Undo2,
} from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreviewPanel } from "@/components/workspace/preview-panel";
import { EmptyState } from "@/components/workspace/panel";
import {
  fetchWorkspaceFile,
  formatClock,
  formatSize,
  previewUrl,
  prepareVersionArtifacts,
  publishVersion,
  unpublishProject,
  shortCommit,
  type Endpoint,
  type WorkspaceFileEntry,
  type WorkspaceFileListing,
  type WorkspaceVersion,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

type WorkbenchTab = "preview" | "workspace" | "terminal" | "versions";

export function WorkbenchPanel({
  className,
  projectId,
  runtime,
  configured,
  previewTick,
  versions,
  files,
  messages,
  onSelectElement,
}: {
  className?: string;
  projectId: string;
  runtime: string;
  configured: boolean;
  previewTick: number;
  versions: Endpoint<WorkspaceVersion[]>;
  files: Endpoint<WorkspaceFileListing>;
  messages: UIMessage[];
  onSelectElement?: (selection: import("@/lib/element-selection").ElementSelection) => void;
}) {
  const terminal = useMemo(() => buildTerminal(messages), [messages]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublish = async (version: WorkspaceVersion) => {
    if (publishingId) return;
    const missingArtifacts = version.hasArtifacts !== true;
    const confirmed = window.confirm(
      missingArtifacts
        ? `版本 ${shortCommit(version.gitCommit)} 还没有发布产物。\n\n发布前会先重新构建并生成产物，然后发布。继续？`
        : `发布版本 ${shortCommit(version.gitCommit)}？\n\n如果已有发布版本，会替换线上版本；访问地址保持不变。`,
    );
    if (!confirmed) return;
    setPublishingId(version.id);
    setPublishError(null);
    try {
      if (missingArtifacts) {
        await prepareVersionArtifacts(projectId, version.id);
      }
      await publishVersion(projectId, version.id);
      versions.refresh();
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishingId(null);
    }
  };

  const handleUnpublish = async (version: WorkspaceVersion) => {
    if (unpublishingId) return;
    const confirmed = window.confirm(
      `取消发布版本 ${shortCommit(version.gitCommit)}？\n\n线上站点会下线，Worker 和自定义域名会被删除；D1 数据会保留。`,
    );
    if (!confirmed) return;
    setUnpublishingId(version.id);
    setPublishError(null);
    try {
      await unpublishProject(projectId);
      versions.refresh();
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : String(error));
    } finally {
      setUnpublishingId(null);
    }
  };

  if (!configured) {
    return (
      <section
        className={cn(
          "flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-card p-6 text-center",
          className
        )}
      >
        <div className="max-w-64">
          <p className="text-sm font-medium">等待确认需求</p>
          <p className="mt-1 text-2xs leading-5 text-muted-foreground">
            在左侧回答几个问题后，我会选择合适的环境并开始生成。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      <Tabs
        defaultValue="preview"
        className="flex h-full min-h-0 flex-col gap-0"
      >
        <div className="border-b border-border px-2 py-1.5">
          <TabsList className="h-8 w-full justify-start gap-1 bg-transparent p-0">
            <TabTrigger value="preview" icon={<Monitor />} label="预览" />
            <TabTrigger value="workspace" icon={<FolderTree />} label="工作区" />
            <TabTrigger
              value="terminal"
              icon={<Terminal />}
              label="终端"
              count={terminal.length}
            />
            <TabTrigger
              value="versions"
              icon={<History />}
              label="版本"
              count={versions.data?.length ?? 0}
            />
          </TabsList>
        </div>

        <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1">
          <PreviewPanel
            projectId={projectId}
            url={previewUrl(projectId)}
            reloadKey={previewTick}
            onSelectElement={onSelectElement}
          />
        </TabsContent>

        <TabsContent
          value="workspace"
          className="mt-0 flex min-h-0 flex-1 flex-col"
        >
          <WorkspaceView
            projectId={projectId}
            runtime={runtime}
            files={files}
          />
        </TabsContent>

        <TabsContent
          value="terminal"
          className="mt-0 flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Terminal className="size-3.5" />
              Agent 命令记录
            </span>
            <span>{terminal.length} 条命令</span>
          </div>
          <TerminalLog entries={terminal} />
        </TabsContent>

        <TabsContent
          value="versions"
          className="mt-0 min-h-0 flex-1 overflow-auto p-3 scrollbar-thin"
        >
          <div className="mb-2 flex items-center justify-between text-2xs text-muted-foreground">
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
          {publishError ? (
            <p className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-2xs text-destructive">
              操作失败：{publishError}
            </p>
          ) : null}

          {versions.data ? (
            versions.data.length === 0 ? (
              <p className="px-1 py-3 text-2xs text-muted-foreground">
                还没有版本：让 Agent 完成一轮修改后自动创建。
              </p>
            ) : (
              <ul className="space-y-1.5">
                {versions.data.map((version) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    publishing={publishingId === version.id}
                    unpublishing={unpublishingId === version.id}
                    onPublish={handlePublish}
                    onUnpublish={handleUnpublish}
                  />
                ))}
              </ul>
            )
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function TabTrigger({
  value,
  icon,
  label,
  count,
}: {
  value: WorkbenchTab;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <TabsTrigger value={value} className="gap-1.5 text-xs">
      {icon}
      {label}
      {count !== undefined && count > 0 ? (
        <span className="text-3xs text-muted-foreground">{count}</span>
      ) : null}
    </TabsTrigger>
  );
}

/* ---------------------------------------------------------------- *
 * Workspace: file tree + code viewer
 * ---------------------------------------------------------------- */

type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
  size?: number;
};

function buildTree(entries: WorkspaceFileEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i]!;
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      current.children ??= [];
      let next = current.children.find((node) => node.name === name);
      if (!next) {
        next = {
          name,
          path,
          type: isFile ? "file" : "dir",
          children: isFile ? undefined : [],
          size: isFile ? entry.size : undefined,
        };
        current.children.push(next);
      }
      current = next!;
    }
  }

  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sort(node.children);
    }
    return nodes;
  };

  return sort(root.children ?? []);
}

function WorkspaceView({
  projectId,
  runtime,
  files,
}: {
  projectId: string;
  runtime: string;
  files: Endpoint<WorkspaceFileListing>;
}) {
  const entries = files.data?.entries ?? [];
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPath && entries.some((entry) => entry.path === selectedPath)) {
      return;
    }
    const preferred = [
      "src/pages/Index.tsx",
      "src/App.tsx",
      "index.html",
      "README.md",
    ];
    const next =
      preferred.find((path) => entries.some((entry) => entry.path === path)) ??
      entries[0]?.path ??
      null;
    setSelectedPath(next);
  }, [entries, selectedPath]);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex max-h-52 min-h-0 w-full shrink-0 flex-col border-b border-border md:max-h-none md:w-56 md:border-r md:border-b-0">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FolderTree className="size-3.5" />
            工作区
          </span>
          <span className="flex items-center gap-1.5">
            {runtime === "container" && files.data && !files.data.running ? (
              <span
                className="text-3xs text-warning"
                title="当前来自 SQL 缓存；读取/刷新会启动沙箱"
              >
                缓存
              </span>
            ) : null}
            <span>{entries.length}</span>
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

        <div className="min-h-0 flex-1 overflow-auto p-1.5 scrollbar-thin">
          <StateRow
            loading={files.loading}
            error={files.error}
            onRetry={files.refresh}
          />
          {entries.length === 0 && !files.loading ? (
            <p className="px-1 py-2 text-2xs leading-5 text-muted-foreground">
              {files.data?.cachedAt === 0
                ? "文件缓存尚未建立；点击刷新会启动沙箱并同步。"
                : "空工作区：还没有任何文件。"}
            </p>
          ) : (
            <ul>
              {tree.map((node) => (
                <TreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <FileViewer
        projectId={projectId}
        runtime={runtime}
        path={selectedPath}
        size={entries.find((entry) => entry.path === selectedPath)?.size}
        fileListing={files.data}
      />
    </div>
  );
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isDir = node.type === "dir";
  const indentClass = ["pl-1.5", "pl-5", "pl-8", "pl-11"][Math.min(depth, 3)];
  const Icon = isDir
    ? open
      ? FolderOpen
      : Folder
    : fileIcon(node.name);

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (isDir) setOpen((value) => !value);
          else onSelect(node.path);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded py-1 pr-1.5 text-left text-xs transition-colors hover:bg-accent",
          indentClass,
          !isDir && node.path === selectedPath
            ? "bg-accent text-foreground"
            : "text-muted-foreground"
        )}
        title={node.path}
        aria-expanded={isDir ? open : undefined}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            isDir ? "text-muted-foreground" : "text-foreground/60"
          )}
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {!isDir && node.size !== undefined ? (
          <span className="shrink-0 text-3xs text-muted-foreground/70">
            {formatSize(node.size)}
          </span>
        ) : null}
      </button>
      {isDir && open && node.children ? (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function fileIcon(name: string) {
  if (name.endsWith(".json")) return FileJson;
  if (/\.(tsx?|jsx?|mjs|cjs|css|html)$/i.test(name)) return FileCode2;
  return FileText;
}

function languageForPath(path: string): string {
  if (/\.tsx?$/.test(path)) return "tsx";
  if (/\.jsx?$/.test(path)) return "jsx";
  if (/\.css$/.test(path)) return "css";
  if (/\.html?$/.test(path)) return "html";
  if (/\.json$/.test(path)) return "json";
  if (/\.md$/.test(path)) return "markdown";
  if (/\.ya?ml$/.test(path)) return "yaml";
  if (/\.sh$/.test(path)) return "bash";
  return "tsx";
}

function FileViewer({
  projectId,
  runtime,
  path,
  size,
  fileListing,
}: {
  projectId: string;
  runtime: string;
  path: string | null;
  size?: number;
  fileListing: WorkspaceFileListing | null;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!path) {
      setContent(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchWorkspaceFile(projectId, `/workspace/${path}`, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setContent(result.content);
        setTruncated(result.truncated);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, path, fileListing, retry]);

  if (!path) {
    return (
      <EmptyState title="选择一个文件" hint="从左侧文件树选择文件查看内容。" />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 truncate font-mono text-2xs text-foreground/80">
          {path}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {runtime === "container" && fileListing && !fileListing.running ? (
            <span
              className="text-3xs text-warning"
              title="读取文件会启动沙箱"
            >
              读取将启动沙箱
            </span>
          ) : null}
          {truncated ? (
            <Badge variant="outline" className="h-4 px-1.5 text-3xs">
              已截断
            </Badge>
          ) : null}
          <span className="text-3xs text-muted-foreground">
            {formatSize(size)}
          </span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 scrollbar-thin">
        {error ? (
          <div className="flex flex-col items-start gap-2 p-2 text-2xs text-destructive">
            <span>读取失败：{error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRetry((value) => value + 1)}
            >
              重试
            </Button>
          </div>
        ) : loading || content === null ? (
          <div className="flex items-center gap-1.5 p-2 text-2xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            读取文件…
          </div>
        ) : (
          <CodeBlock
            code={content}
            language={languageForPath(path)}
            showLineNumbers
            compact
            className="min-h-full rounded-none border-0"
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Versions / terminal / status
 * ---------------------------------------------------------------- */

function versionStatus(
  status: string
): { label: string; tone: string } | null {
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
  // draft 是内部生命周期状态，表示“已保存的正常版本”，不展示成“草稿”。
  if (status === "draft") return null;
  return { label: status, tone: "bg-muted text-muted-foreground border-border" };
}

function VersionRow({
  version,
  publishing,
  unpublishing,
  onPublish,
  onUnpublish,
}: {
  version: WorkspaceVersion;
  publishing: boolean;
  unpublishing: boolean;
  onPublish: (version: WorkspaceVersion) => Promise<void>;
  onUnpublish: (version: WorkspaceVersion) => Promise<void>;
}) {
  const meta = versionStatus(version.status);

  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2",
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
        <div className="ml-auto flex items-center gap-1.5">
          {meta ? (
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-3xs",
                meta.tone
              )}
            >
              {meta.label}
            </span>
          ) : null}
          {version.published ? (
            <span className="rounded-full border border-success/30 bg-success/15 px-1.5 py-0.5 text-3xs text-success">
              已发布
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 line-clamp-2 text-2xs text-muted-foreground">
        {version.summary}
      </p>
      <div className="mt-1 flex items-center gap-2 text-3xs text-muted-foreground/70">
        <span>{formatClock(version.createdAt)}</span>
        {version.archived ? (
          <Badge variant="outline" className="h-4 px-1.5 text-3xs">
            切换前
          </Badge>
        ) : null}
        {version.current ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-3xs">
            当前
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {version.deploymentUrl ? (
          <a
            href={version.deploymentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-3xs text-primary hover:underline"
          >
            访问站点
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {version.published ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-2xs text-muted-foreground"
            disabled={unpublishing}
            title="下线站点，保留 D1 数据"
            onClick={() => void onUnpublish(version)}
          >
            {unpublishing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Undo2 className="size-3" />
            )}
            {unpublishing ? "取消中…" : "取消发布"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={version.published ? "outline" : "default"}
          className="ml-auto h-7 gap-1.5 px-2 text-2xs"
          disabled={publishing}
          title={
            version.hasArtifacts === true
              ? "发布这个版本"
              : "发布前会先重新构建并生成产物"
          }
          onClick={() => void onPublish(version)}
        >
          {publishing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Rocket className="size-3" />
          )}
          {publishing
            ? version.hasArtifacts === true
              ? "发布中…"
              : "构建并发布中…"
            : version.published
              ? "重新发布"
              : version.hasArtifacts === true
                ? "发布"
                : "构建并发布"}
        </Button>
      </div>
      {version.hasArtifacts !== true ? (
        <p className="mt-1 text-3xs text-muted-foreground">
          {version.current
            ? "此版本还没有发布产物；发布时会先重新构建。"
            : "旧版本没有发布产物；请先切换到该版本，或基于当前版本创建新版本。"}
        </p>
      ) : null}
      {version.published && version.domainError ? (
        <p className="mt-1 text-3xs text-amber-600" title={version.domainError}>
          自定义域名未绑定，当前使用 workers.dev 地址。
        </p>
      ) : null}
    </li>
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
          command: output.skipped ? "build（模板无需构建）" : "pnpm build",
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
  if (entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-2xs leading-5 text-muted-foreground">
        等待 Agent 执行命令…
        <br />
        所有 exec / build 调用会显示在这里。
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background/70 px-3 pb-3 pt-2 font-mono text-2xs scrollbar-thin">
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
      <div className="mt-2 flex items-center gap-1">
        <span className="text-success">$</span>
        <span className="animate-pulse text-foreground">▍</span>
      </div>
    </div>
  );
}

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
