"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { ToolUIPart } from "ai";
import { Layers, MessageSquare, Monitor } from "lucide-react";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { PreviewPanel } from "@/components/workspace/preview-panel";
import { SidePanel } from "@/components/workspace/side-panel";
import { TopBar } from "@/components/workspace/top-bar";
import type { RunState } from "@/components/workspace/top-bar";
import {
  AGENT_CLASS,
  WORKER_HOST,
  previewUrl,
  useProject,
  useWorkspaceFiles,
  useWorkspaceVersions,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

type Tab = "chat" | "preview";

const CHAT_WIDTH_KEY = "atoms:chat-width";
const SIDE_WIDTH_KEY = "atoms:side-width";
const DEFAULT_CHAT_WIDTH = 384;
const DEFAULT_SIDE_WIDTH = 320;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 560;
const MIN_SIDE_WIDTH = 260;
const MAX_SIDE_WIDTH = 480;

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
  const [sideOpen, setSideOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(() =>
    storedWidth(CHAT_WIDTH_KEY, DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH),
  );
  const [sideWidth, setSideWidth] = useState(() =>
    storedWidth(SIDE_WIDTH_KEY, DEFAULT_SIDE_WIDTH, MIN_SIDE_WIDTH, MAX_SIDE_WIDTH),
  );

  useEffect(() => {
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
  }, [chatWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDE_WIDTH_KEY, String(sideWidth));
  }, [sideWidth]);

  const layoutStyle = {
    "--chat-width": `${chatWidth}px`,
    "--side-width": `${sideWidth}px`,
  } as CSSProperties;

  // 项目元数据（名称/版本数）与当前项目专属的 Agent 会话
  const project = useProject(projectId);

  const agent = useAgent({
    agent: AGENT_CLASS,
    name: projectId,
    host: WORKER_HOST,
  });
  const {
    messages,
    sendMessage,
    status,
    stop,
    addToolApprovalResponse,
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
  const versions = useWorkspaceVersions(projectId);
  const files = useWorkspaceFiles(projectId);
  const refreshVersions = versions.refresh;
  const refreshFiles = files.refresh;

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
        if (name === "start_preview" || name === "create_version") {
          refreshPreview();
        }
        if (
          name === "create_version" ||
          name === "write_file" ||
          name === "exec" ||
          name === "finish"
        ) {
          refreshFiles();
        }
        if (name === "create_version" || name === "finish") {
          refreshVersions();
        }
      }
    }
  }, [messages, refreshPreview, refreshFiles, refreshVersions]);

  // 顶栏运行状态：isStreaming 覆盖服务端续流，status 覆盖客户端请求
  const busy = status === "submitted" || isStreaming;
  const runState: RunState =
    status === "error" ? "error" : busy ? "running" : "idle";

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
      sendMessage({ text });
    },
    [sendMessage]
  );

  const respondApproval = useCallback(
    (id: string, approved: boolean) => {
      addToolApprovalResponse({ id, approved });
    },
    [addToolApprovalResponse]
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        sideOpen={sideOpen}
        onToggleSide={() => setSideOpen((v) => !v)}
        runState={runState}
        projectId={projectId}
        projectName={projectName}
        currentVersion={currentVersion}
        versionNote={versionNote}
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
        <PreviewPanel
          className={cn(
            "min-w-0 flex-1",
            tab === "preview" ? "flex" : "hidden md:flex"
          )}
          projectId={projectId}
          url={previewUrl(projectId)}
          reloadKey={previewTick}
        />
        <ResizeHandle
          className="hidden xl:flex"
          label="调整侧栏宽度"
          side="right"
          width={sideWidth}
          min={MIN_SIDE_WIDTH}
          max={MAX_SIDE_WIDTH}
          onWidth={setSideWidth}
          onReset={() => setSideWidth(DEFAULT_SIDE_WIDTH)}
        />
        <SidePanel
          className="hidden shrink-0 xl:flex xl:w-(--side-width)"
          versions={versions}
          files={files}
          messages={messages}
        />
      </div>

      {/* md–xl：侧栏以抽屉形式出现 */}
      {sideOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm xl:hidden"
            onClick={() => setSideOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-chat max-w-full p-2 xl:hidden">
            <SidePanel
              className="flex w-full"
              versions={versions}
              files={files}
              messages={messages}
            />
          </div>
        </>
      ) : null}

      {/* <md：底部标签 */}
      <nav className="grid shrink-0 grid-cols-3 border-t border-border bg-card md:hidden">
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          icon={<MessageSquare className="size-4" />}
          label="对话"
        />
        <TabButton
          active={tab === "preview"}
          onClick={() => setTab("preview")}
          icon={<Monitor className="size-4" />}
          label="预览"
        />
        <TabButton
          active={sideOpen}
          onClick={() => setSideOpen((v) => !v)}
          icon={<Layers className="size-4" />}
          label="更多"
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
