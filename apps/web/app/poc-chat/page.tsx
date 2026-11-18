"use client";

import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

const HOST = process.env.NEXT_PUBLIC_AUDIT_HOST ?? "localhost:8796";

/**
 * POC-06 专用页面。验证完成后删除整个目录。
 */
export default function PocChatPage() {
  const [session, setSession] = useState("s1");
  const [draftSession, setDraftSession] = useState("s1");
  const [text, setText] = useState("");

  // 刷新后保持会话：从 URL 的 ?s= 恢复
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("s");
    if (fromUrl) {
      setSession(fromUrl);
      setDraftSession(fromUrl);
    }
  }, []);

  const agent = useAgent({ agent: "ChatAgent", name: session, host: HOST });
  const { messages, sendMessage, status, stop } = useAgentChat({ agent });

  const assistantText = messages
    .filter((m) => m.role === "assistant")
    .map((m) =>
      m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""),
    )
    .join("|");

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">POC-06 · Agents SDK 审计</h1>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          data-testid="session"
          value={draftSession}
          onChange={(e) => setDraftSession(e.target.value)}
          className="w-28 rounded border border-border bg-background px-2 py-1"
        />
        <button
          data-testid="switch"
          type="button"
          onClick={() => {
            setSession(draftSession);
            window.history.replaceState(
              null,
              "",
              `?s=${encodeURIComponent(draftSession)}`,
            );
          }}
          className="rounded border border-border px-2 py-1"
        >
          切换
        </button>
        <span data-testid="current-session">session={session}</span>
        <span data-testid="status">status={status}</span>
      </div>

      <div data-testid="messages" className="min-h-40 space-y-2 rounded border border-border p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">无消息</p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            data-testid="msg"
            data-role={m.role}
            className="text-sm"
          >
            <span className="mr-1 text-2xs text-muted-foreground">{m.role}:</span>
            {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
          </div>
        ))}
      </div>

      <p data-testid="assistant-len" className="text-xs text-muted-foreground">
        {assistantText.length}
      </p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          sendMessage({ text });
          setText("");
        }}
      >
        <input
          data-testid="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="发一条消息"
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          data-testid="send"
          type="submit"
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
        >
          发送
        </button>
        <button
          data-testid="stop"
          type="button"
          onClick={() => stop()}
          className="rounded border border-border px-3 py-1 text-sm"
        >
          停止
        </button>
      </form>
    </main>
  );
}
