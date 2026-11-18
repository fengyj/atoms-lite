import { z } from "zod";
import { artifactKind, previewStatus, runStatus, versionStatus } from "./enums";
import { artifactRef } from "./refs";
import { usage } from "./usage";

/** 会话列表项（首页用）。 */
export const sessionSummary = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string(),
  status: runStatus,
  lastMessageAt: z.number().int(),
  currentVersionId: z.string().nullable(),
  artifact: artifactRef.nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummary>;

export const versionSummary = z.object({
  id: z.string(),
  gitCommit: z.string(),
  parentId: z.string().nullable(),
  summary: z.string(),
  status: versionStatus,
  createdAt: z.number().int(),
  current: z.boolean().default(false),
});
export type VersionSummary = z.infer<typeof versionSummary>;

export const artifactSummary = z.object({
  id: z.string(),
  kind: artifactKind,
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.number().int(),
});
export type ArtifactSummary = z.infer<typeof artifactSummary>;

export const runSummary = z.object({
  id: z.string(),
  parentRunId: z.string().nullable(),
  role: z.string(),
  status: runStatus,
  summary: z.string(),
  usage,
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof runSummary>;

export const previewInfo = z.object({
  status: previewStatus,
  url: z.string().nullable(),
  port: z.number().int().nullable(),
  updatedAt: z.number().int(),
});
export type PreviewInfo = z.infer<typeof previewInfo>;

export const createProjectRequest = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(""),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequest>;

export const createSessionRequest = z.object({
  title: z.string().min(1).max(120),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequest>;

export const renameSessionRequest = z.object({
  title: z.string().min(1).max(120),
});
export type RenameSessionRequest = z.infer<typeof renameSessionRequest>;

export const exportRequest = z.object({
  versionId: z.string().optional(),
  includeUploads: z.boolean().default(false),
});
export type ExportRequest = z.infer<typeof exportRequest>;

export const versionsResponse = z.object({
  versions: z.array(versionSummary),
  currentVersionId: z.string().nullable(),
});
export type VersionsResponse = z.infer<typeof versionsResponse>;

export const artifactsResponse = z.object({
  artifacts: z.array(artifactSummary),
});
export type ArtifactsResponse = z.infer<typeof artifactsResponse>;
