import { z } from "zod";
import { roleId, runStatus } from "./enums";

/**
 * 控制通道事件（channel B）。
 * 对话本身走 AI SDK 的 UIMessage 流，这里只放面板需要的事实。
 */
const base = z.object({
  seq: z.number().int().nonnegative(),
  at: z.number().int(),
  runId: z.string(),
  taskId: z.string().nullable(),
  role: roleId,
});

export const runEvent = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("run.started"), input: z.string() }),
  base.extend({
    type: z.literal("run.status"),
    status: runStatus,
    note: z.string().optional(),
  }),
  base.extend({
    type: z.literal("tool.started"),
    callId: z.string(),
    tool: z.string(),
    input: z.unknown(),
  }),
  base.extend({
    type: z.literal("tool.finished"),
    callId: z.string(),
    tool: z.string(),
    ok: z.boolean(),
    ms: z.number().int().nonnegative(),
    error: z.string().optional(),
  }),
  base.extend({
    type: z.literal("approval.requested"),
    callId: z.string(),
    tool: z.string(),
    preview: z.string(),
  }),
  base.extend({
    type: z.literal("approval.resolved"),
    callId: z.string(),
    approved: z.boolean(),
    reason: z.string().optional(),
  }),
  base.extend({
    type: z.literal("file.changed"),
    path: z.string(),
    op: z.enum(["add", "modify", "delete"]),
  }),
  base.extend({
    type: z.literal("preview.status"),
    status: z.string(),
    url: z.string().optional(),
  }),
  base.extend({
    type: z.literal("version.created"),
    versionId: z.string(),
    gitCommit: z.string(),
    summary: z.string(),
  }),
  base.extend({
    type: z.literal("usage"),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().optional(),
  }),
  base.extend({
    type: z.literal("handoff"),
    to: roleId,
    reason: z.string(),
    refs: z.array(z.string()).default([]),
  }),
  base.extend({
    type: z.literal("run.finished"),
    status: runStatus,
    error: z.string().optional(),
  }),
]);

export type RunEvent = z.infer<typeof runEvent>;
export type RunEventType = RunEvent["type"];
