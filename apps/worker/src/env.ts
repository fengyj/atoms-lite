export interface Env {
  ChatAgent: DurableObjectNamespace;
  WORKSPACE: DurableObjectNamespace;
  PROJECTS: DurableObjectNamespace;
  ASSETS?: Fetcher;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  MODEL_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_WORKERS_SUBDOMAIN?: string;
  /** 每日全站 token 上限；不设置表示不限制。 */
  DAILY_TOKEN_LIMIT?: string;
  /** 每百万 token 的美元价格表（JSON），未配置时不计算费用。 */
  MODEL_PRICING_JSON?: string;
  /** 统计“每日”的时区；默认 Asia/Shanghai。 */
  USAGE_TIMEZONE?: string;
  /** 每天 $ 限额；默认 1 美元。 */
  DAILY_COST_LIMIT_USD?: string;
  /** 预留给单轮透支的金额；默认 0.05 美元。 */
  DAILY_COST_RESERVE_USD?: string;
  /** 触发上下文压缩的 token 阈值；为空时按模型上下文比例计算。 */
  COMPACTION_TOKEN_THRESHOLD?: string;
  /** 模型上下文窗口；默认 1,000,000。 */
  MODEL_CONTEXT_WINDOW?: string;
  /** 压缩触发比例；默认大上下文 50%，小上下文 65%。 */
  COMPACTION_CONTEXT_RATIO?: string;
  /** 压缩时保留最近多少 token；默认 20k。 */
  COMPACTION_KEEP_RECENT_TOKENS?: string;
}

export const SESSION_NAME = "demo";
