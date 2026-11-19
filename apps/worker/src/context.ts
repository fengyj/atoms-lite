import type { ModelMessage } from "ai";

export type MigrationContext = {
  active: boolean;
  sourceTemplate?: string;
  sourceRuntime?: string;
  targetTemplate?: string;
  targetRuntime?: string;
  files?: number;
  bytes?: number;
};

export type RuntimeContext = {
  projectId: string;
  now: Date;
  timezone: string;
  configured: boolean;
  template: string;
  runtime: string;
  suggestedTemplate: string;
  planReason: string;
  container: "running" | "sleeping" | "none";
  instanceTier: string;
  versions: number;
  migration: MigrationContext | null;
  capabilities: string[];
};

export function buildRuntimeContext(input: {
  projectId: string;
  configured: boolean;
  template: string;
  runtime: string;
  suggestedTemplate?: string;
  planReason?: string;
  running?: boolean;
  instanceTier?: string;
  versions?: number;
  migration?: MigrationContext | null;
  capabilities: string[];
}): RuntimeContext {
  const now = new Date();
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // Workers 环境不支持 Intl 时保持 UTC
  }
  return {
    projectId: input.projectId,
    now,
    timezone,
    configured: input.configured,
    template: input.template,
    runtime: input.runtime,
    suggestedTemplate: input.suggestedTemplate ?? input.template,
    planReason: input.planReason ?? "",
    container:
      input.runtime === "browser"
        ? "none"
        : input.running
          ? "running"
          : "sleeping",
    instanceTier: input.instanceTier ?? "basic",
    versions: input.versions ?? 0,
    migration: input.migration ?? null,
    capabilities: input.capabilities,
  };
}

function formatLocalTime(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: timezone,
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

export function renderRuntimeContext(ctx: RuntimeContext): string {
  const lines = [
    "<runtime_context>",
    `time: ${ctx.now.toISOString()}`,
    `local_time: ${formatLocalTime(ctx.now, ctx.timezone)}`,
    `timezone: ${ctx.timezone}`,
    `project: ${ctx.projectId}`,
    `configured: ${ctx.configured}`,
    `template: ${ctx.template}`,
    `runtime: ${ctx.runtime}`,
    `suggested_template: ${ctx.suggestedTemplate}`,
  ];
  if (ctx.planReason) lines.push(`suggestion_reason: ${ctx.planReason}`);
  lines.push(`container: ${ctx.container}`);
  lines.push(`instance: ${ctx.instanceTier}`);
  lines.push(`versions: ${ctx.versions}`);
  if (ctx.migration?.active) {
    lines.push(
      `migration: active`,
      `migration_source: ${ctx.migration.sourceTemplate ?? "?"} / ${ctx.migration.sourceRuntime ?? "?"}`,
      `migration_target: ${ctx.migration.targetTemplate ?? "?"} / ${ctx.migration.targetRuntime ?? "?"}`,
      `migration_files: ${ctx.migration.files ?? 0}`,
      `migration_bytes: ${ctx.migration.bytes ?? 0}`,
    );
  } else {
    lines.push("migration: none");
  }
  lines.push(`capabilities: ${ctx.capabilities.join(", ")}`);
  lines.push("</runtime_context>");
  return lines.join("\n");
}

/**
 * 只附加到「发给模型的最后一条用户消息」，不写回持久化消息。
 * 历史消息不能携带当时的上下文，否则会误导后续回合。
 */
export function appendRuntimeContext(
  messages: ModelMessage[],
  context: string,
): ModelMessage[] {
  const copy = [...messages];
  for (let i = copy.length - 1; i >= 0; i -= 1) {
    const message = copy[i];
    if (!message || message.role !== "user") continue;

    if (typeof message.content === "string") {
      copy[i] = {
        ...message,
        content: `${message.content}\n\n${context}`,
      } as ModelMessage;
    } else {
      copy[i] = {
        ...message,
        content: [
          ...message.content,
          { type: "text", text: context },
        ],
      } as ModelMessage;
    }
    return copy;
  }
  // 没有用户消息时也不要丢上下文：作为一条 system 数据放在末尾。
  copy.push({ role: "user", content: context } as ModelMessage);
  return copy;
}
