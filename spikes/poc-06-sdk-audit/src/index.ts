import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, streamText } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

export interface Env {
  ChatAgent: DurableObjectNamespace;
}

const CHUNKS = 40;
const CHUNK_DELAY_MS = 150;

function mockModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: CHUNK_DELAY_MS,
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          ...Array.from({ length: CHUNKS }, (_, i) => ({
            type: "text-delta" as const,
            id: "t1",
            delta: `chunk-${i + 1} `,
          })),
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        ],
      }),
    }),
  });
}

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

    const result = streamText({
      model: mockModel(),
      messages: await convertToModelMessages(this.messages),
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
