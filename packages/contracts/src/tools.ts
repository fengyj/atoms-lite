import { z } from "zod";
import { roleId } from "./enums";

export const toolName = z.enum([
  "list_files",
  "read_file",
  "write_file",
  "apply_patch",
  "exec",
  "start_preview",
  "stop_preview",
  "create_version",
  "finish",
]);
export type ToolName = z.infer<typeof toolName>;

/** 工作区条目；列表与 stat 共用。 */
export const workspaceEntry = z.object({
  path: z.string(),
  type: z.enum(["file", "dir"]),
  size: z.number().int().nonnegative().optional(),
});
export type WorkspaceEntry = z.infer<typeof workspaceEntry>;

export const execResult = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean().default(false),
});
export type ExecResult = z.infer<typeof execResult>;

export const toolInputs = {
  list_files: z.object({
    path: z.string().default("/workspace"),
  }),
  read_file: z.object({
    path: z.string(),
    maxBytes: z.number().int().positive().max(1024 * 1024).optional(),
  }),
  write_file: z.object({
    path: z.string(),
    content: z.string(),
  }),
  apply_patch: z.object({
    path: z.string(),
    patch: z.string(),
  }),
  exec: z.object({
    program: z.string(),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300_000).optional(),
  }),
  start_preview: z.object({}),
  stop_preview: z.object({}),
  create_version: z.object({
    summary: z.string().min(1).max(200),
  }),
  finish: z.object({
    summary: z.string().max(500).default(""),
  }),
} as const;

export const toolOutputs = {
  list_files: z.object({ entries: z.array(workspaceEntry) }),
  read_file: z.object({
    content: z.string(),
    truncated: z.boolean().default(false),
  }),
  write_file: z.object({
    path: z.string(),
    bytes: z.number().int().nonnegative(),
  }),
  apply_patch: z.object({
    path: z.string(),
    bytes: z.number().int().nonnegative(),
  }),
  exec: execResult,
  start_preview: z.object({
    status: z.enum(["starting", "ready", "failed"]),
    url: z.string().nullable(),
  }),
  stop_preview: z.object({ status: z.enum(["stopped"]) }),
  create_version: z.object({
    versionId: z.string(),
    gitCommit: z.string(),
  }),
  finish: z.object({ ok: z.literal(true) }),
} as const;

/** 需要人工审批的工具。 */
export const RISKY_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "write_file",
  "apply_patch",
  "exec",
  "start_preview",
  "stop_preview",
]);

/** 工具在哪个对象上执行；v1 全部在 WorkspaceDO。 */
export const EXECUTED_BY = "workspace" as const;

/** v1 只启用 builder；其余为多角色预留。 */
export const TOOL_ROLES: Record<ToolName, readonly string[]> = {
  list_files: ["builder", "verifier", "visual", "coordinator"],
  read_file: ["builder", "verifier", "visual", "coordinator"],
  write_file: ["builder"],
  apply_patch: ["builder"],
  exec: ["builder", "verifier"],
  start_preview: ["builder"],
  stop_preview: ["builder"],
  create_version: ["builder"],
  finish: ["builder", "verifier", "visual"],
};

export type ToolSpec = {
  input: z.ZodType;
  output: z.ZodType;
  risky: boolean;
  roles: readonly string[];
};

export const toolSpecs: Record<ToolName, ToolSpec> = Object.fromEntries(
  (Object.keys(toolInputs) as ToolName[]).map((name) => [
    name,
    {
      input: toolInputs[name],
      output: toolOutputs[name],
      risky: RISKY_TOOLS.has(name),
      roles: TOOL_ROLES[name],
    },
  ]),
) as unknown as Record<ToolName, ToolSpec>;

/**
 * 角色访问工作区的唯一接口。
 * v1 本地调用；多角色时同一签名换 RPC。
 */
export interface WorkspaceTools {
  listFiles(path: string): Promise<{ entries: WorkspaceEntry[] }>;
  readFile(
    path: string,
    options?: { maxBytes?: number },
  ): Promise<{ content: string; truncated: boolean }>;
  writeFile(path: string, content: string): Promise<{ path: string; bytes: number }>;
  applyPatch(path: string, patch: string): Promise<{ path: string; bytes: number }>;
  exec(request: {
    program: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
  }): Promise<ExecResult>;
  startPreview(): Promise<{ status: "starting" | "ready" | "failed"; url: string | null }>;
  stopPreview(): Promise<{ status: "stopped" }>;
  createVersion(summary: string): Promise<{ versionId: string; gitCommit: string }>;
}

/** 角色白名单校验；未知角色或越权工具直接拒绝。 */
export function isToolAllowedForRole(name: ToolName, role: string): boolean {
  return TOOL_ROLES[name].includes(role);
}

