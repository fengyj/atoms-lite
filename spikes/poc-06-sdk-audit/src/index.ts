import { AIChatAgent } from "@cloudflare/ai-chat";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

export interface Env {
  ChatAgent: DurableObjectNamespace;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  MODEL_ID?: string;
}

const CHUNKS = 40;
const CHUNK_DELAY_MS = 150;

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function textStream(text: string) {
  return simulateReadableStream({
    chunkDelayInMs: CHUNK_DELAY_MS,
    chunks: [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      ...Array.from({ length: CHUNKS }, (_, i) => ({
        type: "text-delta" as const,
        id: "t1",
        delta: i === 0 ? `${text} ` : `chunk-${i + 1} `,
      })),
      { type: "text-end", id: "t1" },
      { type: "finish", finishReason: "stop", usage },
    ],
  });
}

function toolCallStream(name: string, input: unknown) {
  return simulateReadableStream({
    chunks: [
      { type: "stream-start", warnings: [] },
      { type: "tool-input-start", id: "call1", toolName: name },
      {
        type: "tool-input-delta",
        id: "call1",
        delta: JSON.stringify(input),
      },
      { type: "tool-input-end", id: "call1" },
      { type: "finish", finishReason: "tool-calls", usage },
    ],
  });
}

function realModel(env: Env) {
  const provider = createOpenAICompatible({
    name: "atoms-poc",
    baseURL: (env.MODEL_BASE_URL ?? "").replace(/\/chat\/completions\/?$/, ""),
    apiKey: env.MODEL_API_KEY,
    headers: { "x-opencode-session": "poc-08" },
  });
  return provider(env.MODEL_ID ?? "deepseek-v4.1-flash");
}

function mockModel() {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const hasToolResult = prompt.some((m) => m.role === "tool");
      const lastUser = [...prompt]
        .reverse()
        .find((m) => m.role === "user");
      const text = JSON.stringify(lastUser?.content ?? "");

      if (!hasToolResult) {
        if (text.includes("slow")) {
          return { stream: toolCallStream("slow_tool", { seconds: 1 }) };
        }
        if (text.includes("fail")) {
          return { stream: toolCallStream("fail_tool", {}) };
        }
        if (text.includes("risky")) {
          return { stream: toolCallStream("risky_tool", { target: "app.tsx" }) };
        }
      }

      return { stream: textStream(hasToolResult ? "done" : "plain") };
    },
  });
}

const tools = {
  slow_tool: tool({
    description: "等待指定秒数后返回",
    inputSchema: z.object({ seconds: z.number() }),
    execute: async ({ seconds }) => {
      await new Promise((r) => setTimeout(r, seconds * 1000));
      return { slept: seconds };
    },
  }),
  fail_tool: tool({
    description: "总是失败",
    inputSchema: z.object({}),
    execute: async () => {
      throw new Error("boom: 模拟失败");
    },
  }),
  risky_tool: tool({
    description: "需要人工确认的写操作",
    inputSchema: z.object({ target: z.string() }),
    execute: async ({ target }) => ({ written: target }),
  }),
};

export class ChatAgent extends AIChatAgent<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // B3：验证自建表能否与框架表共存于同一个 DO SQLite
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_versions (
        id TEXT PRIMARY KEY,
        git_commit TEXT NOT NULL
      )
    `);
    ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO atoms_versions (id, git_commit) VALUES ('ver_1', 'abc123')`,
    );

    // POC-07：运行事件表（自建，带 atoms_ 前缀）
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS atoms_run_events (
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        at INTEGER NOT NULL,
        data TEXT,
        PRIMARY KEY (run_id, seq)
      )
    `);
  }

  private emit(runId: string, type: string, data?: unknown) {
    const next = this.ctx.storage.sql
      .exec<{ n: number }>(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM atoms_run_events WHERE run_id = ?",
        runId,
      )
      .one();
    this.ctx.storage.sql.exec(
      "INSERT INTO atoms_run_events (run_id, seq, type, at, data) VALUES (?, ?, ?, ?, ?)",
      runId,
      next.n,
      type,
      Date.now(),
      JSON.stringify(data ?? null),
    );
  }

  async onChatMessage() {
    const runId = `run_${Date.now()}`;
    const t0 = Date.now();
    this.emit(runId, "run.started", { messages: this.messages.length });

    const useReal = Boolean(this.env.MODEL_API_KEY && this.env.MODEL_BASE_URL);

    const result = streamText({
      model: useReal ? realModel(this.env) : mockModel(),
      system: useReal
        ? "你是测试助手。用户说 slow 时必须调用 slow_tool；说 fail 时必须调用 fail_tool；说 risky 时必须调用 risky_tool。不要直接回答，先调用工具。"
        : undefined,
      messages: await convertToModelMessages(this.messages),
      tools,
      toolApproval: { risky_tool: "user-approval" },
      stopWhen: stepCountIs(5),
      onFinish: ({ text, usage, finishReason }) => {
        this.emit(runId, "model.finished", {
          ms: Date.now() - t0,
          chars: text.length,
          finishReason,
          usage,
        });
        this.emit(runId, "run.finished", { ok: true, ms: Date.now() - t0 });
      },
      onError: ({ error }) => {
        this.emit(runId, "run.failed", { error: String(error).slice(0, 300) });
      },
    });

    return result.toUIMessageStreamResponse();
  }
}

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "http://localhost:3000",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
    vary: "origin",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsFor(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const res = await routeAgentRequest(request, env);
    if (!res) return new Response("not found", { status: 404, headers: cors });
    if (res.status === 101) return res;

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
