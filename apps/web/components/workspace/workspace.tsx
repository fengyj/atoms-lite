"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  AGENT_SESSION,
  PREVIEW_URL,
  WORKER_HOST,
  useWorkspaceFiles,
  useWorkspaceVersions,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

type Tab = "chat" | "preview";

export function Workspace() {
  const [tab, setTab] = useState<Tab>("chat");
  const [sideOpen, setSideOpen] = useState(false);

  // 对话：真实 Agent 会话（接口冻结：ChatAgent / demo）
  const agent = useAgent({
    agent: AGENT_CLASS,
    name: AGENT_SESSION,
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

  // 侧栏数据：版本（DO 存储，容器停止也能读）与文件列表
  const versions = useWorkspaceVersions();
  const files = useWorkspaceFiles();
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
        currentVersion={currentVersion}
        versionNote={versionNote}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <ChatPanel
          className={cn(
            "w-full shrink-0 md:flex md:w-chat lg:w-chat-lg xl:w-chat-xl",
            tab === "chat" ? "flex" : "hidden md:flex"
          )}
          messages={messages}
          status={status}
          busy={busy}
          onSubmitText={submitText}
          onStop={stop}
          onApproval={respondApproval}
        />
        <PreviewPanel
          className={cn(
            "min-w-0 flex-1",
            tab === "preview" ? "flex" : "hidden md:flex"
          )}
          url={PREVIEW_URL}
          reloadKey={previewTick}
          onRefresh={refreshPreview}
        />
        <SidePanel
          className="hidden w-side shrink-0 xl:flex"
          versions={versions}
          files={files}
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
