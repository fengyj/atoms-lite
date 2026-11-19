import { AIChatAgent } from "@cloudflare/ai-chat";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
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
  /** 项目删除时清空该项目的会话存储 */
  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/destroy" && request.method === "POST") {
      await this.ctx.storage.deleteAll();
      return Response.json({ ok: true });
    }
    return super.onRequest(request);
  }

  override async onChatMessage(): Promise<Response> {
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
    const ws = new WorkspaceClient(this.env, projectId);
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
          "ask_user",
          "subagent",
          "switch_runtime",
        ]
      : ["ask_user"];

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
      capabilities,
    });

    const model = provider(this.env.MODEL_ID ?? "deepseek-v4.1-flash");
    const tools = createTools({ ws, ctx, model });
    if (configured) {
      await ws.beginRun().catch((error) => {
        console.error("[agent] begin run failed", error);
      });
    }
    const modelMessages = await convertToModelMessages(this.messages);
    const messages = appendRuntimeContext(
      modelMessages,
      renderRuntimeContext(ctx),
    );

    const result = streamText({
      model,
      system: systemPrompt(ctx),
      messages,
      tools,
      stopWhen: stepCountIs(
        !configured
          ? 6
          : template === "static"
            ? MAX_AGENT_STEPS
            : MAX_AGENT_STEPS_BUILD,
      ),
      onFinish: async () => {
        try {
          if (configured && !meta?.migration?.active) {
            const result = await ws.snapshot();
            if (!result.ok) {
              console.error("[agent] finish snapshot failed", result.error);
            }
          }
        } catch (error) {
          console.error("[agent] finish snapshot threw", error);
        } finally {
          if (configured) {
            await ws.endRun().catch((error) => {
              console.error("[agent] end run failed", error);
            });
          }
        }
      },
      onAbort: async () => {
        if (!configured) return;
        await ws.endRun().catch((error) => {
          console.error("[agent] end run after abort failed", error);
        });
      },
      onError: async ({ error }) => {
        console.error("model error", error);
        if (!configured) return;
        await ws.endRun().catch((endError) => {
          console.error("[agent] end run after error failed", endError);
        });
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
