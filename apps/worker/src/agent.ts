import { AIChatAgent } from "@cloudflare/ai-chat";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import {
  MAX_AGENT_STEPS,
  MAX_AGENT_STEPS_BUILD,
} from "@atoms-lite/contracts";
import { z } from "zod";
import type { Env } from "./env";
import { systemPrompt } from "./prompt";
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
    const template = meta?.template ?? "static";

    const tools = {
      list_files: tool({
        description: "列出工作区文件",
        inputSchema: z.object({
          path: z.string().optional().describe("目录，默认 /workspace"),
        }),
        execute: async ({ path }) => {
          try {
            const result = await ws.listFiles();
            const base = (path ?? "/workspace")
              .replace(/^\/workspace\/?/, "")
              .replace(/\/$/, "");

            const entries = base
              ? result.entries.filter(
                  (e) => e.path === base || e.path.startsWith(`${base}/`),
                )
              : result.entries;

            return { entries };
          } catch (error) {
            console.error("[tool] error", error);
            return { error: String(error) };
          }
        },
      }),

      read_file: tool({
        description: "读取一个文件的内容",
        inputSchema: z.object({
          path: z.string().describe("绝对路径，例如 /workspace/app.js"),
        }),
        execute: async ({ path }) => {
          try {
            return await ws.readFile(path);
          } catch (error) {
            console.error("[tool] error", error);
            return { error: String(error) };
          }
        },
      }),

      write_file: tool({
        description: "写入（覆盖）一个文件；内容必须是完整文件",
        inputSchema: z.object({
          path: z.string().describe("绝对路径，例如 /workspace/index.html"),
          content: z.string().describe("完整文件内容"),
        }),
        execute: async ({ path, content }) => {
          try {
            return await ws.writeFile(path, content);
          } catch (error) {
            console.error("[tool] error", error);
            return { error: String(error) };
          }
        },
      }),

      exec: tool({
        description: "在 /workspace 执行受限命令（ls/cat/find/grep/git/node 等）",
        inputSchema: z.object({
          program: z.string(),
          args: z.array(z.string()).default([]),
          cwd: z.string().optional(),
        }),
        execute: async ({ program, args, cwd }) => {
          try {
            return await ws.exec({ program, args, cwd });
          } catch (error) {
            console.error("[tool] error", error);
            return { error: String(error) };
          }
        },
      }),

      start_preview: tool({
        description: "启动（或确认）预览服务",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            return await ws.startPreview();
          } catch (error) {
            console.error("[tool] error", error);
            return { error: String(error) };
          }
        },
      }),

      build: tool({
        description:
          "按当前项目模板执行构建（React/全栈项目必须调用）。返回构建日志与 exitCode。",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            return await ws.build();
          } catch (error) {
            console.error("[tool] build", error);
            return { error: String(error) };
          }
        },
      }),

      create_version: tool({
        description: "把当前工作区保存为一个版本（git commit + 快照）",
        inputSchema: z.object({
          summary: z.string().min(1).max(200).describe("一句中文描述"),
        }),
        execute: async ({ summary }) => {
          try {
            return await ws.createVersion(summary);
          } catch (error) {
            console.error("[tool] error", error);
            return { error: String(error) };
          }
        },
      }),

      finish: tool({
        description: "完成本次实现",
        inputSchema: z.object({
          summary: z.string().max(500).default(""),
        }),
        execute: async ({ summary }) => {
          try {
            await ws.snapshot();
          } catch {
            // 快照失败不影响完成状态
          }
          return { ok: true, summary };
        },
      }),
    };

    const result = streamText({
      model: provider(this.env.MODEL_ID ?? "deepseek-v4.1-flash"),
      system: systemPrompt(template),
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(
        template === "static" ? MAX_AGENT_STEPS : MAX_AGENT_STEPS_BUILD,
      ),
      onFinish: async () => {
        try {
          await ws.snapshot();
        } catch {
          // 忽略快照失败
        }
      },
      onError: ({ error }) => {
        console.error("model error", error);
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
