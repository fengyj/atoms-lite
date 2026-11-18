/**
 * 运行时限制集中在这里，避免散落在各处的魔法数字。
 * 演示环境要省额度：沙箱空闲 5 分钟即回收。
 */
export const SANDBOX_INACTIVITY_TIMEOUT_MS = 5 * 60_000;

/** 单次 Agent 运行的最大步数。 */
export const MAX_AGENT_STEPS = 20;

/** 单次运行的最大交接次数（多角色预留）。 */
export const MAX_HANDOFFS = 6;

/** 单个任务的最大 token 预算（0 表示不限制）。 */
export const MAX_TASK_TOKENS = 120_000;

/** 命令默认超时与输出截断。 */
export const EXEC_TIMEOUT_MS = 120_000;
export const EXEC_MAX_OUTPUT_BYTES = 256 * 1024;

/** 附件上限。 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
] as const;
