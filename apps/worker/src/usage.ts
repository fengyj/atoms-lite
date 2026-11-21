import type { LanguageModelUsage } from "ai";
import type { Env } from "./env";

export type UsageSource =
  | "chat"
  | "planner"
  | "auto_name"
  | "subagent"
  | "compaction"
  | "designer";

export type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
  reasoningTokens: number;
};

export type UsageEventInput = {
  projectId: string;
  sessionId?: string | null;
  requestId?: string | null;
  source: UsageSource;
  model?: string | null;
  stepNumber?: number | null;
  usage: LanguageModelUsage;
};

export type UsageStatus = {
  day: string;
  usedTokens: number;
  limit: number;
  allowed: boolean;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
  reasoningTokens: number;
  costUsd: number | null;
  costLimitUsd: number;
  costReserveUsd: number;
  remainingCostUsd: number;
  tokenLimit: number;
};

type Pricing = {
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
};

/**
 * OpenCode Go 的 DeepSeek V4.1 Flash 默认价格（USD / 1M tokens）。
 * 来源：models.dev `opencode-go/deepseek-v4.1-flash`（2026-11-21 查询）：
 * input 0.15、output 0.60、cache read 0.003。
 * 仍可用 MODEL_PRICING_JSON 覆盖。
 */
const DEFAULT_PRICING: Record<string, Pricing> = {
  "deepseek-v4.1-flash": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheReadPerMillion: 0.003,
  },
  "deepseek-v4.1-flash-1017": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheReadPerMillion: 0.003,
  },
  "deepseek-flash": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheReadPerMillion: 0.003,
  },
};

function count(value: number | undefined | null): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

export function normalizeUsage(
  usage: LanguageModelUsage | undefined,
): NormalizedUsage {
  const inputTokens = count(usage?.inputTokens);
  const outputTokens = count(usage?.outputTokens);
  const cacheReadTokens = count(usage?.inputTokenDetails?.cacheReadTokens);
  const cacheWriteTokens = count(usage?.inputTokenDetails?.cacheWriteTokens);
  const noCacheTokens =
    usage?.inputTokenDetails?.noCacheTokens !== undefined
      ? count(usage.inputTokenDetails.noCacheTokens)
      : Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: count(usage?.totalTokens) || inputTokens + outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    noCacheTokens,
    reasoningTokens: count(usage?.outputTokenDetails?.reasoningTokens),
  };
}

function pricingFor(env: Env, model: string | null | undefined): Pricing | null {
  if (!model) return null;
  let table: Record<string, Pricing> = { ...DEFAULT_PRICING };
  if (env.MODEL_PRICING_JSON) {
    try {
      const overrides = JSON.parse(env.MODEL_PRICING_JSON) as Record<
        string,
        Pricing
      >;
      table = { ...table, ...overrides };
    } catch (error) {
      console.error("[usage.pricing_invalid]", String(error).slice(0, 200));
    }
  }
  const pricing = table[model];
  if (
    !pricing ||
    typeof pricing.inputPerMillion !== "number" ||
    typeof pricing.outputPerMillion !== "number"
  ) {
    return null;
  }
  return pricing;
}

/**
 * 使用内置默认价格表，并允许 MODEL_PRICING_JSON 覆盖（每百万 token 的美元价格）：
 * {"deepseek-v4.1-flash":{"inputPerMillion":0.15,"outputPerMillion":0.6,"cacheReadPerMillion":0.003}}
 *
 * 未知模型返回 null，UI 显示“未配置价格”，不会伪造 0 费用。
 */
export function estimateCostUsd(
  env: Env,
  model: string | null | undefined,
  usage: NormalizedUsage,
): number | null {
  const pricing = pricingFor(env, model);
  if (!pricing) return null;
  const inputPrice = pricing.inputPerMillion ?? 0;
  const cacheReadPrice = pricing.cacheReadPerMillion ?? inputPrice;
  const cacheWritePrice = pricing.cacheWritePerMillion ?? inputPrice;
  const cost =
    (usage.noCacheTokens * inputPrice +
      usage.cacheReadTokens * cacheReadPrice +
      usage.cacheWriteTokens * cacheWritePrice +
      usage.outputTokens * (pricing.outputPerMillion ?? 0)) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * 记录一次真实发生的模型调用。失败只记日志，不影响主流程；
 * 每日限额检查会单独 fail-open。
 */
export async function recordUsage(
  env: Env,
  input: UsageEventInput,
): Promise<void> {
  const usage = normalizeUsage(input.usage);
  const costUsd = estimateCostUsd(env, input.model, usage);
  console.log(
    "[usage.record]",
    JSON.stringify({
      projectId: input.projectId,
      source: input.source,
      model: input.model ?? null,
      stepNumber: input.stepNumber ?? null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      noCacheTokens: usage.noCacheTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd,
    }),
  );
  try {
    const stub = env.PROJECTS.get(env.PROJECTS.idFromName("registry"));
    const res = await stub.fetch("https://projects/usage/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        sessionId: input.sessionId ?? input.projectId,
        requestId: input.requestId ?? null,
        source: input.source,
        model: input.model ?? null,
        stepNumber: input.stepNumber ?? null,
        usage,
        costUsd,
      }),
    });
    if (!res.ok) {
      throw new Error((await res.text()).slice(0, 300));
    }
  } catch (error) {
    console.error(
      "[usage.record_failed]",
      JSON.stringify({
        projectId: input.projectId,
        source: input.source,
        model: input.model ?? null,
        error: String(error).slice(0, 300),
      }),
    );
  }
}

function tokenLimit(env: Env): number {
  const value = Number(env.DAILY_TOKEN_LIMIT ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function costLimit(env: Env): number {
  const raw = env.DAILY_COST_LIMIT_USD;
  const value = raw === undefined || raw === "" ? 1 : Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 1;
}

function costReserve(env: Env): number {
  const raw = env.DAILY_COST_RESERVE_USD;
  const value = raw === undefined || raw === "" ? 0.05 : Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 0.05;
}

function emptyStatus(env: Env): UsageStatus {
  const dailyCost = costLimit(env);
  return {
    day: new Date().toISOString().slice(0, 10),
    usedTokens: 0,
    limit: tokenLimit(env),
    tokenLimit: tokenLimit(env),
    allowed: true,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    noCacheTokens: 0,
    reasoningTokens: 0,
    costUsd: null,
    costLimitUsd: dailyCost,
    costReserveUsd: costReserve(env),
    remainingCostUsd: dailyCost,
  };
}

export async function getUsageStatus(env: Env): Promise<UsageStatus> {
  try {
    const stub = env.PROJECTS.get(env.PROJECTS.idFromName("registry"));
    const res = await stub.fetch("https://projects/usage/status");
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as UsageStatus;
  } catch (error) {
    console.error("[usage.status_failed]", String(error).slice(0, 300));
    // 查询失败时不能把整个站点锁死。
    return emptyStatus(env);
  }
}

/** 在开始新一轮模型请求前检查每日总额度；不中断进行中的回合。 */
export async function checkDailyLimit(env: Env): Promise<UsageStatus> {
  if (tokenLimit(env) <= 0 && costLimit(env) <= 0) {
    return emptyStatus(env);
  }
  return getUsageStatus(env);
}
