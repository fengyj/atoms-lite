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
}

export const SESSION_NAME = "demo";
