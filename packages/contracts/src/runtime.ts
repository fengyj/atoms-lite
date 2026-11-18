import { z } from "zod";

/** 生成应用的运行配置；随项目保存，恢复时重新注入。 */
export const runtimeConfig = z.object({
  runtime: z.enum(["node", "python", "static"]),
  command: z.string(),
  cwd: z.string().default("/workspace"),
  port: z.number().int().min(1).max(65535).nullable(),
  healthPath: z.string().default("/"),
  /** 非敏感环境变量，明文保存。 */
  env: z.record(z.string(), z.string()).default({}),
  /** 敏感变量的引用，真实值在平台 Secret Store。 */
  secretRefs: z.record(z.string(), z.string()).default({}),
});
export type RuntimeConfig = z.infer<typeof runtimeConfig>;

export const previewTarget = z.object({
  projectId: z.string(),
  status: z.enum(["stopped", "starting", "ready", "failed"]),
  url: z.string().nullable(),
  port: z.number().int().nullable(),
  updatedAt: z.number().int(),
});
export type PreviewTarget = z.infer<typeof previewTarget>;
