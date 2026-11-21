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
}

export const SESSION_NAME = "demo";
