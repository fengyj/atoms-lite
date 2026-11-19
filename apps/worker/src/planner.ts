import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";
import type { Env } from "./env";
import type { TemplateId } from "./templates";

const planSchema = z.object({
  template: z.enum(["static", "react-vite", "fullstack-hono"]),
  reason: z.string().min(1).max(200),
});

export type TemplatePlan = {
  template: TemplateId;
  reason: string;
};

/**
 * 模糊需求的技术选型。失败时返回 null，由调用方回退到确定性规则。
 * 这是一次短模型调用，不参与后续生成上下文。
 */
export async function planTemplate(
  env: Env,
  prompt: string,
): Promise<TemplatePlan | null> {
  const baseURL = env.MODEL_BASE_URL;
  const apiKey = env.MODEL_API_KEY;
  if (!baseURL || !apiKey) return null;

  try {
    const provider = createOpenAICompatible({
      name: "atoms-planner",
      baseURL: baseURL.replace(/\/chat\/completions\/?$/, ""),
      apiKey,
      headers: { "x-opencode-session": "atoms-lite" },
    });

    const result = await generateObject({
      model: provider(env.MODEL_ID ?? "deepseek-v4.1-flash"),
      schema: planSchema,
      temperature: 0,
      maxOutputTokens: 300,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(12_000),
      system: `你是 atoms-lite 的项目技术选型器。只输出结构化结果。
可选模板：
- static：展示型页面、单页、小游戏、营销页；无构建；只需要 localStorage 保存数据时优先选它。
- react-vite：组件化、多页面、复杂前端交互、需要路由/状态管理，但不需要后端。
- fullstack-hono：需要后端 API、数据库、登录、上传或跨设备持久化。

规则：
- 选择能完整满足需求的最小模板，不要为了“更完整”而选 fullstack。
- 明确要求 React/Vite 时选 react-vite；明确需要数据库/后端时选 fullstack。
- 当前不支持 Next.js/Vue；遇到这类需求选最接近的 react-vite，并在 reason 说明。
- reason 用一句中文，最多 60 字。`,
      prompt,
    });

    return {
      template: result.object.template,
      reason: result.object.reason.trim().slice(0, 200),
    };
  } catch (error) {
    console.error("[planner] template selection failed", error);
    return null;
  }
}
