"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { ToolUIPart } from "ai";
import { MessageSquare, Monitor } from "lucide-react";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { TopBar } from "@/components/workspace/top-bar";
import { WorkbenchPanel } from "@/components/workspace/workbench";
import type { RunState } from "@/components/workspace/top-bar";
import {
  AGENT_CLASS,
  WORKER_HOST,
  useProject,
  useProjectUsage,
  useWorkspaceFiles,
  useWorkspaceMeta,
  useWorkspaceVersions,
  upgradeInstance,
  configureProject,
  switchRuntime,
  renameProject,
} from "@/lib/agent";
import type { AskUserInput, AskUserPayload } from "@/components/workspace/ask-user-card";
import type { ElementSelection } from "@/lib/element-selection";
import { cn } from "@/lib/utils";

type Tab = "chat" | "workbench";

const CHAT_WIDTH_KEY = "atoms:chat-width";
const DEFAULT_CHAT_WIDTH = 384;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 560;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function storedWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? clamp(value, min, max) : fallback;
}

export function Workspace({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [chatWidth, setChatWidth] = useState(() =>
    storedWidth(CHAT_WIDTH_KEY, DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH),
  );
  useEffect(() => {
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
  }, [chatWidth]);

  const layoutStyle = {
    "--chat-width": `${chatWidth}px`,
  } as CSSProperties;

  // 项目元数据（名称/版本数）与当前项目专属的 Agent 会话
  const project = useProject(projectId);
  const usage = useProjectUsage(projectId);

  const agent = useAgent({
    agent: AGENT_CLASS,
    name: projectId,
    host: WORKER_HOST,
    // 默认就是 cf-websocket（Hibernation API）；显式固定，避免以后误用
    // capnweb 传输导致 DO 在空闲连接期间持续计 duration。
    transport: "cf-websocket",
  });
  const {
    messages,
    sendMessage,
    status,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    isStreaming,
  } = useAgentChat({ agent });

  // 首页把第一条需求放在 ?prompt= 里；连接就绪且当前空闲时自动发送
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [agentReady, setAgentReady] = useState(false);

  useEffect(() => {
    let alive = true;
    agent.ready
      .then(() => {
        if (alive) setAgentReady(true);
      })
      .catch(() => {
        // 连接失败时保持手动输入，错误由对话面板展示
      });
    return () => {
      alive = false;
    };
  }, [agent]);

  useEffect(() => {
    const prompt = new URLSearchParams(window.location.search)
      .get("prompt")
      ?.trim();
    if (!prompt) return;
    // 清掉 query，刷新时不再重复发送
    window.history.replaceState(null, "", `/sessions/${projectId}`);
    setPendingPrompt(prompt);
  }, [projectId]);

  useEffect(() => {
    if (!pendingPrompt || !agentReady) return;
    if (status !== "ready" || isStreaming) return;
    setPendingPrompt(null);
    sendMessage({ text: pendingPrompt });
  }, [pendingPrompt, agentReady, status, isStreaming, sendMessage]);

  // 侧栏数据：版本（DO 存储，容器停止也能读）与文件列表
  const workspaceMeta = useWorkspaceMeta(projectId);
  const versions = useWorkspaceVersions(projectId);
  const files = useWorkspaceFiles(projectId);
  const refreshVersions = versions.refresh;
  const refreshFiles = files.refresh;
  const refreshMeta = workspaceMeta.refresh;

  // 预览刷新：start_preview / create_version 完成后由 watcher 触发
  const [previewTick, setPreviewTick] = useState(0);
  const refreshPreview = useCallback(() => setPreviewTick((t) => t + 1), []);

  // 工具结果驱动 UI：预览自动刷新、侧栏列表按需重取
  const completedToolsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!part.type.startsWith("tool-")) continue;
        const tool = part as ToolUIPart;
        const finished =
          tool.state === "output-available" ||
          tool.state === "output-error" ||
          tool.state === "output-denied";
        if (!finished) continue;
        if (completedToolsRef.current.has(tool.toolCallId)) continue;
        completedToolsRef.current.add(tool.toolCallId);

        const name = tool.type.slice("tool-".length);
        if (
          name === "start_preview" ||
          name === "create_version" ||
          name === "build"
        ) {
          refreshPreview();
        }
        if (
          name === "create_version" ||
          name === "write_file" ||
          name === "build" ||
          name === "exec" ||
          name === "finish"
        ) {
          refreshFiles();
        }
        if (name === "create_version" || name === "finish") {
          refreshVersions();
          refreshMeta();
        }
      }
    }
  }, [messages, refreshPreview, refreshFiles, refreshVersions, refreshMeta]);

  // 顶栏运行状态：isStreaming 覆盖服务端续流，status 覆盖客户端请求
  const busy = status === "submitted" || isStreaming;
  const runState: RunState =
    status === "error" ? "error" : busy ? "running" : "idle";

  // 每轮结束后刷新用量；自动命名等异步调用会在下面的定时器里再补刷。
  const refreshUsage = usage.refresh;
  useEffect(() => {
    if (!busy) refreshUsage();
  }, [busy, refreshUsage]);

  // 首轮对话后 Agent 会异步生成项目名；在回合结束后轻量刷新两次以拿到新标题。
  const userMessageCount = messages.filter(
    (message) => message.role === "user"
  ).length;
  const projectNameSource = project.data?.nameSource;
  const autoNameRefreshCount = useRef(0);
  useEffect(() => {
    if (busy || userMessageCount === 0) return;
    if (userMessageCount === autoNameRefreshCount.current) return;
    autoNameRefreshCount.current = userMessageCount;
    if (projectNameSource && projectNameSource !== "derived") return;
    // 命名是异步的：多刷几次，拿到 AI 标题后 nameSource 会变成 ai，effect 会清理剩余定时器。
    const timers = [2000, 6000, 12000, 18000].map((ms) =>
      window.setTimeout(() => {
        project.refresh();
        usage.refresh();
      }, ms)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [busy, userMessageCount, projectNameSource, project.refresh, usage.refresh]);

  const currentVersion =
    versions.data?.find((v) => v.current) ?? versions.data?.at(-1) ?? null;
  const versionNote = versions.loading
    ? "版本加载中"
    : versions.error
      ? "版本不可用"
      : currentVersion
        ? null
        : "暂无版本";

  const projectName = project.data?.name ?? "工作区";

  useEffect(() => {
    document.title = `${projectName} · atoms-lite`;
  }, [projectName]);

  const submitText = useCallback(
    (text: string) => {
      sendMessage(
        { text },
        { body: selection ? { selection } : {} }
      );
      setSelection(null);
    },
    [sendMessage, selection]
  );

  const handleUpgrade = useCallback(async () => {
    if (upgrading) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const result = await upgradeInstance(projectId);
      if (!result.upgraded && result.error) {
        setUpgradeError(result.error);
      }
      workspaceMeta.refresh();
      versions.refresh();
      files.refresh();
      refreshPreview();
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpgrading(false);
    }
  }, [
    projectId,
    upgrading,
    workspaceMeta.refresh,
    versions.refresh,
    files.refresh,
    refreshPreview,
  ]);

  const respondApproval = useCallback(
    (id: string, approved: boolean) => {
      addToolApprovalResponse({ id, approved });
    },
    [addToolApprovalResponse]
  );

  const respondAskUser = useCallback(
    async (id: string, input: AskUserInput, payload: AskUserPayload) => {
      const template =
        payload.template ??
        input.recommendedTemplate ??
        project.data?.template ??
        "react-vite";
      if (!project.data?.configured) {
        await configureProject(projectId, template);
      }
      addToolOutput({
        toolCallId: id,
        toolName: "ask_user",
        output: { ...payload, template },
      });
      project.refresh();
      workspaceMeta.refresh();
      files.refresh();
      versions.refresh();
    },
    [
      addToolOutput,
      projectId,
      project.data?.configured,
      project.data?.template,
      project.refresh,
      workspaceMeta.refresh,
      files.refresh,
      versions.refresh,
    ]
  );

  const renameProjectName = useCallback(
    async (name: string) => {
      await renameProject(projectId, name);
      project.refresh();
    },
    [projectId, project.refresh]
  );

  const respondContinue = useCallback(
    (id: string, cont: boolean) => {
      addToolOutput({
        toolCallId: id,
        toolName: "confirm_continue",
        output: { continue: cont },
      });
    },
    [addToolOutput]
  );

  const respondSwitchRuntime = useCallback(
    async (
      id: string,
      input: {
        template: "static" | "react-vite" | "fullstack-hono";
        reason: string;
      },
      confirmed: boolean
    ) => {
      if (!confirmed) {
        addToolOutput({
          toolCallId: id,
          toolName: "switch_runtime",
          output: { cancelled: true },
        });
        return;
      }
      await switchRuntime(projectId, input.template);
      addToolOutput({
        toolCallId: id,
        toolName: "switch_runtime",
        output: { prepared: true, template: input.template },
      });
      project.refresh();
      workspaceMeta.refresh();
      files.refresh();
      versions.refresh();
      setPreviewTick((tick) => tick + 1);
    },
    [
      addToolOutput,
      projectId,
      project.refresh,
      workspaceMeta.refresh,
      files.refresh,
      versions.refresh,
    ]
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        runState={runState}
        projectId={projectId}
        projectName={projectName}
        template={project.data?.template ?? "static"}
        runtime={project.data?.runtime ?? "container"}
        configured={project.data?.configured ?? true}
        migrationActive={workspaceMeta.data?.migration?.active ?? false}
        instanceTier={workspaceMeta.data?.instanceTier ?? "basic"}
        upgrading={upgrading}
        upgradeError={upgradeError}
        onUpgrade={() => void handleUpgrade()}
        snapshotError={workspaceMeta.data?.snapshotError ?? null}
        currentVersion={currentVersion}
        versionNote={versionNote}
        usage={usage.data}
        usageLoading={usage.loading}
        onRename={renameProjectName}
      />

      <div className="flex min-h-0 flex-1 gap-1 p-2" style={layoutStyle}>
        <ChatPanel
          className={cn(
            "w-full shrink-0 md:flex md:w-(--chat-width)",
            tab === "chat" ? "flex" : "hidden md:flex"
          )}
          messages={messages}
          status={status}
          busy={busy}
          onSubmitText={submitText}
          onStop={stop}
          onApproval={respondApproval}
          onAskUser={respondAskUser}
          onSwitchRuntime={respondSwitchRuntime}
          onContinue={respondContinue}
          fallbackTemplate={project.data?.template ?? "static"}
          selection={selection}
          onClearSelection={() => setSelection(null)}
        />
        <ResizeHandle
          className="hidden md:flex"
          label="调整对话宽度"
          side="left"
          width={chatWidth}
          min={MIN_CHAT_WIDTH}
          max={MAX_CHAT_WIDTH}
          onWidth={setChatWidth}
          onReset={() => setChatWidth(DEFAULT_CHAT_WIDTH)}
        />
        <WorkbenchPanel
          className={cn(
            "min-w-0 flex-1",
            tab === "workbench" ? "flex" : "hidden md:flex"
          )}
          projectId={projectId}
          runtime={project.data?.runtime ?? "container"}
          configured={project.data?.configured ?? true}
          previewTick={previewTick}
          versions={versions}
          files={files}
          messages={messages}
          onSelectElement={(next) => {
            setSelection(next);
            if (
              typeof window !== "undefined" &&
              window.matchMedia("(max-width: 767px)").matches
            ) {
              setTab("chat");
            }
          }}
        />
      </div>

      {/* <md：底部标签 */}
      <nav className="grid shrink-0 grid-cols-2 border-t border-border bg-card md:hidden">
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          icon={<MessageSquare className="size-4" />}
          label="对话"
        />
        <TabButton
          active={tab === "workbench"}
          onClick={() => setTab("workbench")}
          icon={<Monitor className="size-4" />}
          label="工作台"
        />
      </nav>
    </div>
  );
}

function ResizeHandle({
  className,
  label,
  side,
  width,
  min,
  max,
  onWidth,
  onReset,
}: {
  className?: string;
  label: string;
  /** left：拖动右边缘调整左侧面板；right：拖动左边缘调整右侧面板 */
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  onWidth: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = event.clientX - drag.current.startX;
    const raw =
      side === "left"
        ? drag.current.startWidth + delta
        : drag.current.startWidth - delta;
    onWidth(clamp(raw, min, max));
  };

  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="拖动调整宽度，双击重置"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      className={cn(
        "group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none items-center justify-center",
        className
      )}
    >
      <span className="h-10 w-px rounded-full bg-border transition-colors group-hover:bg-primary" />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 py-2 text-3xs",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
