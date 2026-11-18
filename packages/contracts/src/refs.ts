import { z } from "zod";
import { artifactId } from "./ids";
import { artifactKind } from "./enums";

/** 附件的元信息；消息里只存 id，不存 base64。 */
export const artifactRef = z.object({
  id: artifactId,
  kind: artifactKind,
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof artifactRef>;

/** 跨角色、跨任务传递上下文时只传引用。 */
export const contextRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("artifact"), id: artifactId }),
  z.object({ kind: z.literal("version"), id: z.string() }),
  z.object({ kind: z.literal("file"), path: z.string() }),
  z.object({ kind: z.literal("log"), id: z.string() }),
]);
export type ContextRef = z.infer<typeof contextRef>;
