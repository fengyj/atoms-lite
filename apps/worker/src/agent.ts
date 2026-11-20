import { AIChatAgent } from "@cloudflare/ai-chat";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import {
  MAX_AGENT_STEPS,
  MAX_AGENT_STEPS_BUILD,
} from "@atoms-lite/contracts";
import type { Env } from "./env";
import {
  appendRuntimeContext,
  buildRuntimeContext,
  renderRuntimeContext,
} from "./context";
import { systemPrompt } from "./prompt";
import { createTools } from "./tools";
import { WorkspaceClient } from "./workspace/client";

export class ChatAgent extends AIChatAgent<Env> {
  /** 模型流 5 分钟没有任何 chunk 时进入有界恢复，覆盖长 build/评审但不至于挂死。 */
  override chatStreamStallTimeoutMs = 300_000;

  /** 恢复失败时给用户一个可操作的终止提示，而不是留下空消息。 */
  override chatRecovery = {
    terminalMessage:
      "本轮执行中断了。可以点击重试或继续，我会从当前进度接着做。",
  };

  /** 项目删除时清空该项目的会话存储 */
  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/destroy" && request.method === "POST") {
      await this.ctx.storage.deleteAll();
      return Response.json({ ok: true });
    }
    return super.onRequest(request);
  }

  /** 给持久化消息补一个客户端可读的 createdAt，用于聊天时间分隔。 */
  protected override sanitizeMessageForPersistence(message: UIMessage): UIMessage {
    const metadata =
      message.metadata &&
      typeof message.metadata === "object" &&
      !Array.isArray(message.metadata)
        ? (message.metadata as Record<string, unknown>)
        : {};
    if (typeof metadata.createdAt === "number") return message;
    return {
      ...message,
      metadata: { ...metadata, createdAt: Date.now() },
    };
  }

  override async onChatMessage(
    _onFinish?: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: {
      requestId?: string;
      continuation?: boolean;
      body?: Record<string, unknown>;
    },
  ): Promise<Response> {
    const baseURL = this.env.MODEL_BASE_URL;
    const apiKey = this.env.MODEL_API_KEY;

    if (!baseURL || !apiKey) {
      return Response.json(
        {
          error: "MODEL_NOT_CONFIGURED",
          hint: "在 apps/worker/.dev.vars 配置 MODEL_BASE_URL / MODEL_API_KEY / MODEL_ID",
        },
        { status: 500 },
      );
    }

    const provider = createOpenAICompatible({
      name: "atoms-model",
      baseURL: baseURL.replace(/\/chat\/completions\/?$/, ""),
      apiKey,
      headers: { "x-opencode-session": "atoms-lite" },
    });

    // Agent 实例名就是项目 ID：/agents/chat-agent/<projectId>
    const projectId = this.name;
    const requestId = options?.requestId ?? "unknown";
    const ws = new WorkspaceClient(this.env, projectId, { requestId });
    const meta = await ws.meta().catch(() => null);
    const configured = meta?.configured !== false;
    const template = meta?.template ?? "static";
    const runtime = meta?.runtime ?? "container";
    const builds = template === "react-vite" || template === "fullstack-hono";
    const capabilities = configured
      ? [
          "files",
          ...(runtime === "browser" || template !== "static"
            ? ["packages"]
            : []),
          ...(runtime === "container" ? ["shell"] : []),
          ...(builds && runtime === "container" ? ["build"] : []),
          ...(template === "fullstack-hono" ? ["api"] : []),
          ...(meta?.migration?.active ? ["migration"] : []),
          "preview",
          "versions",
          "design_check",
          "ask_user",
          "subagent",
          "switch_runtime",
        ]
      : ["ask_user"];

    const rawSelection = options?.body?.selection;
    const selection =
      rawSelection &&
      typeof rawSelection === "object" &&
      typeof (rawSelection as { selector?: unknown }).selector === "string"
        ? (rawSelection as {
            selector: string;
            tag: string;
            id?: string | null;
            classes?: string[];
            text?: string;
            outerHTML?: string;
            styles?: Record<string, string>;
            url?: string;
          })
        : null;

    const ctx = buildRuntimeContext({
      projectId,
      configured,
      template,
      runtime,
      suggestedTemplate: template,
      planReason: "",
      running: meta?.running,
      instanceTier: meta?.instanceTier,
      versions: meta?.versionCount,
      migration: meta?.migration ?? null,
      selection,
      capabilities,
    });

    const model = provider(this.env.MODEL_ID ?? "deepseek-v4.1-flash");
    const tools = createTools({ ws, ctx, model });
    if (configured) {
      await ws.beginRun().catch((error) => {
        console.error(
          "[agent.turn.begin_run_failed]",
          JSON.stringify({
            projectId,
            requestId: options?.requestId ?? "unknown",
            error: String(error).slice(0, 300),
          }),
        );
      });
    }
    const modelMessages = await convertToModelMessages(this.messages);
    const messages = appendRuntimeContext(
      modelMessages,
      renderRuntimeContext(ctx),
    );

    const maxSteps = !configured
      ? 6
      : template === "static"
        ? MAX_AGENT_STEPS
        : MAX_AGENT_STEPS_BUILD;
    const turnLog = {
      projectId,
      requestId,
      continuation: options?.continuation ?? false,
      template,
      runtime,
      configured,
      messages: modelMessages.length,
      selection: Boolean(selection),
    };
    const startedAt = Date.now();
    console.log("[agent.turn.start]", JSON.stringify(turnLog));

    const result = streamText({
      model,
      system: systemPrompt(ctx),
      messages,
      tools,
      stopWhen: stepCountIs(maxSteps),
      // 到达单轮步数上限时，不再静默停止：强制模型调用确认卡，
      // 让用户决定是否继续，避免必须手动发送“继续”。
      prepareStep: ({ stepNumber, steps }) => {
        const last = steps.at(-1);
        const finished = last?.toolCalls?.some(
          (call) => call.toolName === "finish",
        );
        return configured &&
          !finished &&
          stepNumber >= maxSteps - 1 &&
          last?.finishReason === "tool-calls"
          ? {
              toolChoice: { type: "tool", toolName: "confirm_continue" },
              activeTools: ["confirm_continue"],
            }
          : {};
      },
      onFinish: async (finish) => {
        let snapshotOk: boolean | null = null;
        try {
          if (configured && !meta?.migration?.active) {
            const snapshot = await ws.snapshot();
            snapshotOk = snapshot.ok;
            if (!snapshot.ok) {
              console.error(
                "[agent.turn.snapshot_failed]",
                JSON.stringify({
                  projectId,
                  requestId,
                  error: snapshot.error?.slice(0, 300),
                }),
              );
            }
          }
        } catch (error) {
          console.error(
            "[agent.turn.snapshot_error]",
            JSON.stringify({
              projectId,
              requestId,
              error: String(error).slice(0, 300),
            }),
          );
        } finally {
          console.log(
            "[agent.turn.finish]",
            JSON.stringify({
              ...turnLog,
              steps: finish.stepNumber + 1,
              finishReason: finish.finishReason,
              inputTokens: finish.usage?.inputTokens ?? 0,
              outputTokens: finish.usage?.outputTokens ?? 0,
              durationMs: Date.now() - startedAt,
              snapshotOk,
            }),
          );
          if (configured) {
            await ws.endRun().catch((error) => {
              console.error(
                "[agent.turn.end_run_failed]",
                JSON.stringify({
                  projectId,
                  requestId,
                  error: String(error).slice(0, 300),
                }),
              );
            });
          }
        }
      },
      onAbort: async ({ reason }) => {
        console.error(
          "[agent.turn.abort]",
          JSON.stringify({
            ...turnLog,
            durationMs: Date.now() - startedAt,
            reason: String(reason ?? "").slice(0, 300),
          }),
        );
        if (!configured) return;
        await ws.endRun().catch((error) => {
          console.error(
            "[agent.turn.end_run_after_abort_failed]",
            JSON.stringify({
              projectId,
              requestId,
              error: String(error).slice(0, 300),
            }),
          );
        });
      },
      onError: async ({ error }) => {
        console.error(
          "[agent.turn.error]",
          JSON.stringify({
            ...turnLog,
            durationMs: Date.now() - startedAt,
            error: String(error).slice(0, 500),
          }),
        );
        if (!configured) return;
        await ws.endRun().catch((endError) => {
          console.error(
            "[agent.turn.end_run_after_error_failed]",
            JSON.stringify({
              projectId,
              requestId,
              error: String(endError).slice(0, 300),
            }),
          );
        });
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
