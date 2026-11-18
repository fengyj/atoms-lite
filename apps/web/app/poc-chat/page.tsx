"use client";

import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { ToolUIPart } from "ai";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";

const HOST = process.env.NEXT_PUBLIC_AUDIT_HOST ?? "localhost:8796";

export default function PocChatPage() {
  const [session, setSession] = useState("s1");
  const [draftSession, setDraftSession] = useState("s1");
  const [text, setText] = useState("");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("s");
    if (fromUrl) {
      setSession(fromUrl);
      setDraftSession(fromUrl);
    }
  }, []);

  const agent = useAgent({ agent: "ChatAgent", name: session, host: HOST });
  const { messages, sendMessage, status, stop, addToolApprovalResponse } =
    useAgentChat({ agent });

  const assistantText = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""))
    .join("|");

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">POC-08 · Agent ↔ UI 接线</h1>

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

      <div
        data-testid="messages"
        className="min-h-48 space-y-3 rounded border border-border p-3"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">无消息</p>
        ) : null}

        {messages.map((m) => (
          <Message key={m.id} from={m.role}>
            <MessageContent className="space-y-2">
              {m.parts.map((raw, i) => {
                if (raw.type === "text") {
                  return (
                    <MessageResponse key={i}>{raw.text}</MessageResponse>
                  );
                }

                if (raw.type.startsWith("tool-")) {
                  const part = raw as ToolUIPart;
                  return (
                    <div
                      key={i}
                      data-testid="tool"
                      data-tool={part.type}
                      data-state={part.state}
                    >
                      <Tool defaultOpen>
                        <ToolHeader type={part.type} state={part.state} />
                        <ToolContent>
                          {part.input ? (
                            <ToolInput input={part.input} />
                          ) : null}
                          <ToolOutput
                            output={part.output}
                            errorText={part.errorText}
                          />
                        </ToolContent>
                      </Tool>

                      {part.state === "approval-requested" &&
                      part.approval?.id ? (
                        <Confirmation
                          approval={part.approval}
                          state={part.state}
                        >
                          <ConfirmationTitle>需要确认</ConfirmationTitle>
                          <ConfirmationRequest>
                            即将执行 {part.type}
                          </ConfirmationRequest>
                          <ConfirmationActions>
                            <ConfirmationAction
                              data-testid="deny"
                              variant="outline"
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: part.approval!.id,
                                  approved: false,
                                })
                              }
                            >
                              拒绝
                            </ConfirmationAction>
                            <ConfirmationAction
                              data-testid="approve"
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: part.approval!.id,
                                  approved: true,
                                })
                              }
                            >
                              批准
                            </ConfirmationAction>
                          </ConfirmationActions>
                        </Confirmation>
                      ) : null}
                    </div>
                  );
                }

                return null;
              })}
            </MessageContent>
          </Message>
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
          placeholder="slow / fail / risky"
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
