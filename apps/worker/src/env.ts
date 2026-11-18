export interface Env {
  ChatAgent: DurableObjectNamespace;
  WORKSPACE: DurableObjectNamespace;
  ASSETS?: Fetcher;
  MODEL_BASE_URL?: string;
  MODEL_API_KEY?: string;
  MODEL_ID?: string;
}

export const PROJECT_NAME = "demo";
export const SESSION_NAME = "demo";
