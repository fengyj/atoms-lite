import { z } from "zod";

/** 角色：v1 只实例化 builder，其余为后续预留。 */
export const roleId = z.enum(["coordinator", "builder", "verifier", "visual"]);
export type RoleId = z.infer<typeof roleId>;

/** 任务意图：写冲突方案暂缓，v1 串行。 */
export const intent = z.enum(["read", "write"]);
export type Intent = z.infer<typeof intent>;

export const runStatus = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "waiting_lock",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof runStatus>;

export const taskStatus = z.enum([
  "queued",
  "waiting_lock",
  "running",
  "blocked",
  "done",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof taskStatus>;

export const versionStatus = z.enum(["draft", "verified", "failed"]);
export type VersionStatus = z.infer<typeof versionStatus>;

export const previewStatus = z.enum(["stopped", "starting", "ready", "failed"]);
export type PreviewStatus = z.infer<typeof previewStatus>;

export const artifactKind = z.enum([
  "upload",
  "screenshot",
  "build_log",
  "source_zip",
  "export",
]);
export type ArtifactKind = z.infer<typeof artifactKind>;

export const approvalStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export type ApprovalStatus = z.infer<typeof approvalStatus>;

/** 任务/事件的创建者：用户或某个角色。 */
export const createdBy = z.union([z.literal("user"), roleId]);
export type CreatedBy = z.infer<typeof createdBy>;
