import type { ModelMessage } from "ai";

export type SelectionContext = {
  selector: string;
  tag: string;
  id?: string | null;
  classes?: string[];
  text?: string;
  outerHTML?: string;
  styles?: Record<string, string>;
  url?: string;
};

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
  requirementsStatus: string | null;
  designStatus: string;
  designId: string | null;
  selection?: SelectionContext | null;
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
  requirementsStatus?: string | null;
  designStatus?: string;
  designId?: string | null;
  selection?: SelectionContext | null;
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
    requirementsStatus: input.requirementsStatus ?? null,
    designStatus: input.designStatus ?? "none",
    designId: input.designId ?? null,
    selection: input.selection ?? null,
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
  lines.push(`requirements: ${ctx.requirementsStatus ?? "none"}`);
  lines.push(`design_status: ${ctx.designStatus}`);
  if (ctx.designId) lines.push(`design_id: ${ctx.designId}`);
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
  if (ctx.selection) {
    const selection = ctx.selection;
    // 选中元素并入 runtime_context，避免在用户消息后追加独立标签。
    lines.push(
      "selection: user-selected element",
      `selection_selector: ${selection.selector}`,
      `selection_tag: ${selection.tag}`,
      ...(selection.id ? [`selection_id: ${selection.id}`] : []),
      ...(selection.classes?.length
        ? [`selection_classes: ${selection.classes.join(" ")}`]
        : []),
      ...(selection.text
        ? [`selection_text: ${selection.text.slice(0, 300)}`]
        : []),
      ...(selection.styles
        ? [
            `selection_styles: ${Object.entries(selection.styles)
              .slice(0, 20)
              .map(([key, value]) => `${key}=${String(value).slice(0, 100)}`)
              .join("; ")}`,
          ]
        : []),
      ...(selection.outerHTML
        ? [
            `selection_html: ${selection.outerHTML
              .slice(0, 3000)
              .replace(/<\/runtime_context>/gi, "&lt;/runtime_context&gt;")}`,
          ]
        : []),
      ...(selection.url ? [`selection_page: ${selection.url}`] : []),
    );
  } else {
    lines.push("selection: none");
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
