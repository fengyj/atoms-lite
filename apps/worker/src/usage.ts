import type { LanguageModelUsage } from "ai";
import type { Env } from "./env";

export type UsageSource =
  | "chat"
  | "planner"
  | "auto_name"
  | "subagent"
  | "compaction";

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
};

type Pricing = {
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
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
  if (!env.MODEL_PRICING_JSON || !model) return null;
  try {
    const table = JSON.parse(env.MODEL_PRICING_JSON) as Record<string, Pricing>;
    const pricing = table[model];
    if (
      !pricing ||
      typeof pricing.inputPerMillion !== "number" ||
      typeof pricing.outputPerMillion !== "number"
    ) {
      return null;
    }
    return pricing;
  } catch (error) {
    console.error("[usage.pricing_invalid]", String(error).slice(0, 200));
    return null;
  }
}

/**
 * 价格表由 MODEL_PRICING_JSON 提供（每百万 token 的美元价格）：
 * {"deepseek-v4.1-flash":{"inputPerMillion":0.28,"outputPerMillion":0.42,"cacheReadPerMillion":0.028}}
 *
 * 没有配置价格时返回 null，UI 显示“未配置”，不会伪造 0 费用。
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

export async function getUsageStatus(env: Env): Promise<UsageStatus> {
  const limit = Number(env.DAILY_TOKEN_LIMIT ?? 0) || 0;
  try {
    const stub = env.PROJECTS.get(env.PROJECTS.idFromName("registry"));
    const res = await stub.fetch("https://projects/usage/status");
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as UsageStatus;
  } catch (error) {
    console.error("[usage.status_failed]", String(error).slice(0, 300));
    // 查询失败时不能把整个站点锁死。
    return {
      day: new Date().toISOString().slice(0, 10),
      usedTokens: 0,
      limit,
      allowed: true,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      noCacheTokens: 0,
      reasoningTokens: 0,
      costUsd: null,
    };
  }
}

/** 在调用模型前检查每日总量；未配置 DAILY_TOKEN_LIMIT 时直接放行。 */
export async function checkDailyLimit(env: Env): Promise<UsageStatus> {
  const limit = Number(env.DAILY_TOKEN_LIMIT ?? 0) || 0;
  if (limit <= 0) {
    return {
      day: new Date().toISOString().slice(0, 10),
      usedTokens: 0,
      limit: 0,
      allowed: true,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      noCacheTokens: 0,
      reasoningTokens: 0,
      costUsd: null,
    };
  }
  return getUsageStatus(env);
}
