import { z } from "zod";
import { artifactId, projectId, sessionId, versionId } from "./ids";
import {
  approvalStatus,
  artifactKind,
  createdBy,
  intent,
  previewStatus,
  roleId,
  runStatus,
  taskStatus,
  versionStatus,
} from "./enums";
import { artifactRef } from "./refs";
import { usage } from "./usage";
import { runtimeConfig } from "./runtime";

export const project = z.object({
  id: projectId,
  name: z.string(),
  description: z.string().default(""),
  currentVersionId: versionId.nullable(),
  runtime: runtimeConfig.nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Project = z.infer<typeof project>;

export const sessionMeta = z.object({
  id: sessionId,
  projectId,
  title: z.string(),
  currentVersionId: versionId.nullable(),
  lastMessageAt: z.number().int(),
  createdAt: z.number().int(),
});
export type SessionMeta = z.infer<typeof sessionMeta>;

export const version = z.object({
  id: versionId,
  projectId,
  sessionId,
  parentId: versionId.nullable(),
  /** 注意：SQLite 里列名用 git_commit，commit 是保留字。 */
  gitCommit: z.string(),
  status: versionStatus,
  summary: z.string().default(""),
  messageId: z.string().nullable(),
  createdAt: z.number().int(),
});
export type Version = z.infer<typeof version>;

export const artifact = z.object({
  id: artifactId,
  projectId,
  versionId: versionId.nullable(),
  kind: artifactKind,
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string().nullable(),
  r2Key: z.string(),
  createdAt: z.number().int(),
});
export type Artifact = z.infer<typeof artifact>;

export const approval = z.object({
  id: z.string(),
  runId: z.string(),
  callId: z.string(),
  role: roleId,
  tool: z.string(),
  preview: z.string(),
  status: approvalStatus,
  createdAt: z.number().int(),
  decidedAt: z.number().int().nullable(),
});
export type Approval = z.infer<typeof approval>;

/** 每次 Agent 调用都是一个 Run；单角色时 parentRunId 为 null。 */
export const run = z.object({
  id: z.string(),
  parentRunId: z.string().nullable(),
  projectId,
  sessionId,
  taskId: z.string().nullable(),
  role: roleId,
  status: runStatus,
  summary: z.string().default(""),
  usage,
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
});
export type Run = z.infer<typeof run>;

export const task = z.object({
  id: z.string(),
  projectId,
  sessionId,
  /** null 表示交给 supervisor 决定。 */
  role: roleId.nullable(),
  intent,
  /** read 任务必须绑定版本，否则结论会随写入失效。 */
  targetVersionId: versionId.nullable(),
  title: z.string(),
  inputRefs: z.array(artifactRef).default([]),
  dependsOn: z.array(z.string()).default([]),
  priority: z.number().int().default(0),
  status: taskStatus,
  createdBy,
  resultRunId: z.string().nullable(),
  usage,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Task = z.infer<typeof task>;

export const preview = z.object({
  projectId,
  status: previewStatus,
  url: z.string().nullable(),
  port: z.number().int().nullable(),
  updatedAt: z.number().int(),
});
export type Preview = z.infer<typeof preview>;
