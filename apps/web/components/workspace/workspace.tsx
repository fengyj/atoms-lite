"use client";

import { useState } from "react";
import { Layers, MessageSquare, Monitor } from "lucide-react";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { PreviewPanel } from "@/components/workspace/preview-panel";
import { SidePanel } from "@/components/workspace/side-panel";
import { TopBar } from "@/components/workspace/top-bar";
import { cn } from "@/lib/utils";

type Tab = "chat" | "preview";

export function Workspace() {
  const [tab, setTab] = useState<Tab>("chat");
  const [sideOpen, setSideOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar sideOpen={sideOpen} onToggleSide={() => setSideOpen((v) => !v)} />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <ChatPanel
          className={cn(
            "w-full shrink-0 md:flex md:w-chat lg:w-chat-lg xl:w-chat-xl",
            tab === "chat" ? "flex" : "hidden md:flex"
          )}
        />
        <PreviewPanel
          className={cn(
            "min-w-0 flex-1",
            tab === "preview" ? "flex" : "hidden md:flex"
          )}
        />
        <SidePanel className="hidden w-side shrink-0 xl:flex" />
      </div>

      {/* md–xl：侧栏以抽屉形式出现 */}
      {sideOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm xl:hidden"
            onClick={() => setSideOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-chat max-w-full p-2 xl:hidden">
            <SidePanel className="flex w-full" />
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
