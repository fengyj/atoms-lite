import { AIChatAgent } from "@cloudflare/ai-chat";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createCompactFunction } from "agents/sessions";
import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import type { ChatResponseResult } from "@cloudflare/ai-chat";
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
import {
  appendRetryNudge,
  normalizeModelMessages,
  shouldRetryEmptyTurn,
  trimModelMessages,
} from "./history";
import { createTools } from "./tools";
import { WorkspaceClient } from "./workspace/client";
import {
  checkDailyLimit,
  estimateCostUsd,
  normalizeUsage,
  recordUsage,
} from "./usage";

function cleanProjectName(raw: string): string {
  return raw
    .replace(/^(项目名称|标题|名称)\s*[:：]\s*/i, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^["'“”‘’《》【】\s]+|["'“”‘’《》【】\s]+$/g, "")
    .replace(/[。！？!?，,；;：:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export class ChatAgent extends AIChatAgent<Env> {
  /** 模型流 5 分钟没有任何 chunk 时进入有界恢复，覆盖长 build/评审但不至于挂死。 */
  override chatStreamStallTimeoutMs = 300_000;

  /** 恢复失败时给用户一个可操作的终止提示，而不是留下空消息。 */
  override chatRecovery = {
    terminalMessage:
      "本轮执行中断了。可以点击重试或继续，我会从当前进度接着做。",
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const contextWindow =
      Number(this.env.MODEL_CONTEXT_WINDOW ?? 1_000_000) || 1_000_000;
    const ratioRaw = this.env.COMPACTION_CONTEXT_RATIO;
    const ratio =
      ratioRaw === undefined || ratioRaw === ""
        ? contextWindow >= 500_000
          ? 0.5
          : 0.65
        : Number(ratioRaw);
    const explicitThreshold = Number(this.env.COMPACTION_TOKEN_THRESHOLD ?? 0);
    const threshold =
      explicitThreshold > 0
        ? explicitThreshold
        : Math.max(
            1_000,
            Math.floor(contextWindow * (Number.isFinite(ratio) ? ratio : 0.5)),
          );
    const keepRecent =
      Number(this.env.COMPACTION_KEEP_RECENT_TOKENS ?? 20_000) || 20_000;
    const name = this.ctx.id.name ?? this.name;
    this.sessions
      .session()
      .onCompaction(
        createCompactFunction({
          keepRecentTokens: keepRecent,
          summarize: async (prompt) => {
            const model = this.createModel();
            if (!model) throw new Error("model not configured");
            const result = await generateText({
              model,
              prompt,
              maxOutputTokens: 4000,
              maxRetries: 0,
              abortSignal: AbortSignal.timeout(60_000),
            });
            await recordUsage(this.env, {
              projectId: name,
              sessionId: name,
              requestId: null,
              source: "compaction",
              model: this.env.MODEL_ID ?? null,
              usage: result.usage,
            });
            return result.text;
          },
        }),
      )
      .compactAfter(threshold);
  }

  /** 项目删除时清空该项目的会话存储 */
  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/destroy" && request.method === "POST") {
      await this.ctx.storage.deleteAll();
      return Response.json({ ok: true });
    }
    return super.onRequest(request);
  }

  private createModel() {
    const baseURL = this.env.MODEL_BASE_URL;
    const apiKey = this.env.MODEL_API_KEY;
    if (!baseURL || !apiKey) return null;
    const provider = createOpenAICompatible({
      name: "atoms-model",
      baseURL: baseURL.replace(/\/chat\/completions\/?$/, ""),
      apiKey,
      headers: { "x-opencode-session": "atoms-lite" },
    });
    return provider(this.env.MODEL_ID ?? "deepseek-v4.1-flash");
  }

  /** 首轮对话完成后，用一个短模型调用生成更可读的项目标题。 */
  protected override onChatResponse(result: ChatResponseResult): void {
    if (result.status !== "completed") return;
    if (this.name === "demo") return;
    this.ctx.waitUntil(this.maybeAutoNameProject(result.requestId));
  }

  private async maybeAutoNameProject(requestId: string): Promise<void> {
    const projects = this.env.PROJECTS.get(
      this.env.PROJECTS.idFromName("registry"),
    );
    const fail = async (error: unknown) => {
      console.error(
        "[agent.project.name_failed]",
        JSON.stringify({
          projectId: this.name,
          requestId,
          error: String(error).slice(0, 300),
        }),
      );
      await projects
        .fetch(`https://projects/projects/${this.name}/auto-name`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "fallback" }),
        })
        .catch(() => undefined);
    };

    try {
      const res = await projects.fetch(
        `https://projects/projects/${this.name}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        project?: { prompt?: string; nameSource?: string };
      };
      const project = data.project;
      if (!project) return;
      if (project.nameSource && project.nameSource !== "derived") return;

      const userTexts = this.messages
        .filter((message) => message.role === "user")
        .map((message) =>
          message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
        )
        .filter(Boolean);
      if (!userTexts.length && !project.prompt) return;

      const context = [
        project.prompt ?? "",
        ...userTexts.slice(-2),
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1600);
      const model = this.createModel();
      if (!model) {
        await fail("model not configured");
        return;
      }

      const budget = await checkDailyLimit(this.env);
      if (!budget.allowed) {
        await fail("daily token limit");
        return;
      }

      const { text, usage } = await generateText({
        model,
        system:
          "你是一个项目命名助手。根据用户需求生成一个简短、具体的中文项目标题。要求：4-12 个汉字；不要引号、标点、emoji；不要“项目/应用/工具”等空泛词。只输出标题本身。",
        prompt: context,
        maxOutputTokens: 32,
        temperature: 0.3,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(12_000),
      });
      await recordUsage(this.env, {
        projectId: this.name,
        sessionId: this.name,
        requestId,
        source: "auto_name",
        model: this.env.MODEL_ID ?? null,
        usage,
      });
      const name = cleanProjectName(text);
      if (!name) {
        await fail("empty generated name");
        return;
      }

      const update = await projects.fetch(
        `https://projects/projects/${this.name}/auto-name`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, source: "ai" }),
        },
      );
      console.log(
        "[agent.project.name]",
        JSON.stringify({
          projectId: this.name,
          requestId,
          name,
          source: "ai",
          ok: update.ok,
        }),
      );
    } catch (error) {
      await fail(error);
    }
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
    const model = this.createModel();

    if (!model) {
      return Response.json(
        {
          error: "MODEL_NOT_CONFIGURED",
          hint: "在 apps/worker/.dev.vars 配置 MODEL_BASE_URL / MODEL_API_KEY / MODEL_ID",
        },
        { status: 500 },
      );
    }

    const budget = await checkDailyLimit(this.env);
    if (!budget.allowed) {
      return Response.json(
        {
          error: "DAILY_TOKEN_LIMIT",
          message: `今日模型额度已用完（$${budget.costUsd?.toFixed(4) ?? "0"} / $${budget.costLimitUsd.toFixed(2)}），请明天再试。`,
          usedTokens: budget.usedTokens,
          limit: budget.costLimitUsd,
        },
        { status: 429 },
      );
    }

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
          "requirements",
          "design",
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
      requirementsStatus: meta?.requirementsStatus ?? null,
      designStatus: meta?.designStatus ?? "none",
      designId: meta?.designId ?? null,
      selection,
      capabilities,
    });

    const tools = createTools({
      ws,
      ctx,
      model,
      recordUsage: (source, usage) =>
        recordUsage(this.env, {
          projectId,
          sessionId: projectId,
          requestId,
          source,
          model: this.env.MODEL_ID ?? null,
          usage,
        }),
    });
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
    const normalizedMessages = normalizeModelMessages(modelMessages);
    const preparedMessages = shouldRetryEmptyTurn(this.messages)
      ? appendRetryNudge(normalizedMessages)
      : normalizedMessages;
    // 供应商网关对超大请求可能直接返回 upstream_unavailable；
    // 保留最近约 30k tokens，避免长会话永远无法继续。
    const budgetedMessages = trimModelMessages(preparedMessages, 120_000);
    if (budgetedMessages.length !== preparedMessages.length) {
      console.warn(
        "[agent.history.trimmed]",
        JSON.stringify({
          projectId,
          requestId: options?.requestId ?? "unknown",
          before: preparedMessages.length,
          after: budgetedMessages.length,
          chars: JSON.stringify(preparedMessages).length,
        }),
      );
    }
    const messages = appendRuntimeContext(
      budgetedMessages,
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

    // 每个 step 就是一次真实的模型请求；onFinish / onAbort 都可能有 steps。
    type UsageStep = {
      stepNumber: number;
      usage: LanguageModelUsage;
      model?: { modelId?: string };
    };
    const recordedUsageSteps = new Set<number>();
    const recordSteps = async (steps: UsageStep[]) => {
      for (const step of steps) {
        if (recordedUsageSteps.has(step.stepNumber)) continue;
        recordedUsageSteps.add(step.stepNumber);
        await recordUsage(this.env, {
          projectId,
          sessionId: projectId,
          requestId,
          source: "chat",
          model: step.model?.modelId ?? this.env.MODEL_ID ?? null,
          stepNumber: step.stepNumber,
          usage: step.usage,
        });
      }
    };
    let budgetWrapRequested = false;

    const result = streamText({
      model,
      system: systemPrompt(ctx),
      messages,
      tools,
      // 不显式设置时，供应商默认输出预算可能被 reasoning 吃光，
      // 长会话下会出现 finishReason=stop 但没有任何文本/工具调用的空回复。
      maxOutputTokens: 16_000,
      stopWhen: stepCountIs(maxSteps),
      // 到达单轮步数上限时，不再静默停止：强制模型调用确认卡，
      // 让用户决定是否继续，避免必须手动发送“继续”。
      prepareStep: ({ stepNumber, steps }) => {
        const spentCost = steps.reduce((sum, step) => {
          const usage = normalizeUsage(step.usage);
          const cost =
            estimateCostUsd(
              this.env,
              step.model?.modelId ?? this.env.MODEL_ID ?? null,
              usage,
            ) ?? 0;
          return sum + cost;
        }, 0);
        const remaining = budget.remainingCostUsd - spentCost;
        if (
          !budgetWrapRequested &&
          budget.costLimitUsd > 0 &&
          remaining <= budget.costReserveUsd
        ) {
          budgetWrapRequested = true;
          console.warn(
            "[agent.budget.wrapup]",
            JSON.stringify({
              projectId,
              requestId,
              stepNumber,
              spentCost,
              remaining,
              reserve: budget.costReserveUsd,
            }),
          );
          return {
            system: `${systemPrompt(ctx)}

【预算提醒】今日模型额度即将用完。请不要继续调用任何工具，用一段简洁的中文总结：
1. 已完成的内容；
2. 尚未完成的内容；
3. 建议用户下一步做什么。
然后立即结束本轮。`,
            toolChoice: "none" as const,
            activeTools: [],
          };
        }

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
      onStepFinish: async (step) => {
        // 每一步结束后立即记账，turn 后面报错/中断也不会丢已完成的调用。
        await recordSteps([step]);
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
          const turnUsage = normalizeUsage(finish.usage);
          const turnCostUsd = estimateCostUsd(
            this.env,
            this.env.MODEL_ID ?? null,
            turnUsage,
          );
          await recordSteps(finish.steps);
          const emptyTurn =
            finish.steps.length > 0 &&
            finish.steps.every(
              (step) => !step.text.trim() && step.toolCalls.length === 0,
            );
          if (emptyTurn) {
            console.warn(
              "[agent.turn.empty]",
              JSON.stringify({
                ...turnLog,
                steps: finish.stepNumber + 1,
                finishReason: finish.finishReason,
                outputTokens: turnUsage.outputTokens,
                reasoningTokens: turnUsage.reasoningTokens,
              }),
            );
          }
          console.log(
            "[agent.turn.finish]",
            JSON.stringify({
              ...turnLog,
              steps: finish.stepNumber + 1,
              finishReason: finish.finishReason,
              inputTokens: turnUsage.inputTokens,
              outputTokens: turnUsage.outputTokens,
              totalTokens: turnUsage.totalTokens,
              cacheReadTokens: turnUsage.cacheReadTokens,
              cacheWriteTokens: turnUsage.cacheWriteTokens,
              noCacheTokens: turnUsage.noCacheTokens,
              reasoningTokens: turnUsage.reasoningTokens,
              costUsd: turnCostUsd,
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
      onAbort: async (event) => {
        console.error(
          "[agent.turn.abort]",
          JSON.stringify({
            ...turnLog,
            durationMs: Date.now() - startedAt,
            reason: String(event.reason ?? "").slice(0, 300),
          }),
        );
        await recordSteps(event.steps);
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

    return result.toUIMessageStreamResponse({
      redactToolErrors: false,
      onError: (error) => {
        const name = error instanceof Error ? error.name : typeof error;
        const message =
          error instanceof Error
            ? error.message || String(error)
            : typeof error === "string"
              ? error
              : JSON.stringify(error);
        const detail = `${name}: ${message || "未知错误"}`.slice(0, 500);
        console.error(
          "[agent.stream.error]",
          JSON.stringify({ projectId, requestId, detail }),
        );
        return `模型调用失败：${detail}`;
      },
    });
  }
}
