import { z } from "zod";

/**
 * 所有 ID 都带前缀，便于日志与跨表排错。
 * 没有用 branded type，避免在跨包传递时到处 as。
 */
const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9-]+$`));

export const projectId = id("prj");
export const sessionId = id("ses");
export const versionId = id("ver");
export const artifactId = id("art");
export const runId = id("run");
export const callId = id("cal");
export const taskId = id("tsk");
export const approvalId = id("apr");

export type ProjectId = z.infer<typeof projectId>;
export type SessionId = z.infer<typeof sessionId>;
export type VersionId = z.infer<typeof versionId>;
export type ArtifactId = z.infer<typeof artifactId>;
export type RunId = z.infer<typeof runId>;
export type CallId = z.infer<typeof callId>;
export type TaskId = z.infer<typeof taskId>;
export type ApprovalId = z.infer<typeof approvalId>;
