import { z } from "zod";

export const errorCode = z.enum([
  "MODEL_NOT_CONFIGURED",
  "MODEL_FAILED",
  "SANDBOX_NOT_READY",
  "SANDBOX_EXEC_FAILED",
  "BUILD_FAILED",
  "PREVIEW_FAILED",
  "VERSION_CONFLICT",
  "WRITE_LOCK_TIMEOUT",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_TYPE_UNSUPPORTED",
  "PATH_ESCAPE",
  "COMMAND_NOT_ALLOWED",
  "UNKNOWN",
]);
export type ErrorCode = z.infer<typeof errorCode>;

export const appError = z.object({
  code: errorCode,
  message: z.string(),
  details: z.unknown().optional(),
});
export type AppError = z.infer<typeof appError>;
