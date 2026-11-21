import {
  generateObject,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";
import { z } from "zod";
import type {
  DesignConceptInput,
  RequirementsBrief,
} from "./workspace/client";

/**
 * 模型偶尔会省略 title/thesis/palette（尤其是 HTML 很长时），
 * 所以只强制 html + designMd，其余字段用方向种子补默认值。
 */
const paletteValueSchema = z.union([
  z.string(),
  z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
  z.record(z.string(), z.unknown()),
]);

const conceptSchema = z.object({
  title: z.string().optional(),
  thesis: z.string().optional(),
  // 模型会把色彩写成字符串、token 数组或 { bg: "#..." } 对象。
  palette: paletteValueSchema.optional(),
  designMd: z.string().min(1).max(200000),
  html: z.string().min(80).max(200000),
});

type DirectionSeed = {
  title: string;
  thesis: string;
  palette: string;
  layout: string;
};

const NEW_DIRECTIONS: DirectionSeed[] = [
  {
    title: "编排式日志",
    thesis: "用纵向叙事、衬线标题和大量留白建立阅读节奏，首屏先讲清今天。",
    palette: "纸张底色 / 深墨正文 / 单一低饱和强调色",
    layout:
      "像一本排好的刊物：顶部一行刊头（日期、栏目、天气），接着一个大号日期标题和一段摘要，再往下才是任务列表。不要卡片网格，不要居中大标题 + 三张卡。用细线、边注、字距和留白分区。",
  },
  {
    title: "工作台清单",
    thesis: "信息密集、可快速扫描，用对齐和分组代替装饰。",
    palette: "冷白或浅灰底 / 近黑文字 / 一个功能性强调色",
    layout:
      "像一个安静但专业的工作台：首屏顶部是紧凑的状态条（今日进度、连续记录、下一步），主体是带编号或分组标签的高密度清单，右侧或下方有一条窄的统计栏。无衬线为主，字号克制，尽量用栅格和基线对齐。不要杂志式大标题。",
  },
  {
    title: "触感摘要",
    thesis: "用大色块、柔和几何和醒目的摘要数字，让页面先有情绪再有细节。",
    palette: "暖色或低饱和材质色 / 深色文字 / 一个高对比点缀",
    layout:
      "像一张海报或工作台上的便签：首屏有一个很大的摘要数字或环形/条形图形（完成数、连续天数），周围是短句和手写感标记，任务列表放在下半部分。可以用不对称构图、大圆角、色带或叠层，但保持克制，不做通用 SaaS 仪表盘。",
  },
  {
    title: "索引档案",
    thesis: "用目录和索引组织内容，强调快速定位，而不是从头读到尾。",
    palette: "中性纸色 / 深色文字 / 一个目录强调色",
    layout:
      "像一份档案索引：首屏是一条横向目录，或左侧固定索引栏；主体是按编号/字母分组的高密度条目，右侧或下方显示当前条目的详情。不要卡片网格、不要大标题海报；用编号、对齐、细线和固定栏建立秩序。",
  },
  {
    title: "宣言海报",
    thesis: "用一句明确的宣言和强对比排版建立记忆点，内容按横向色带展开。",
    palette: "高对比主色 / 大面积留白或深底 / 一个辅助色",
    layout:
      "像一张宣言海报：首屏是一句大字宣言或一个超大关键词，配少量说明；往下用横向色带、粗线和错位栅格展示内容。允许不对称和大字号，但信息仍要可读；不要通用仪表盘。",
  },
];

const REVISION_DIRECTIONS: DirectionSeed[] = [
  {
    title: "更出版物",
    thesis: "保留产品事实，把信息重新排成一本可读的刊物。",
    palette: "沿用当前设计，但减少颜色数量",
    layout:
      "在现有设计基础上做结构变化：强化刊头、日期、栏目标签和长文段落，把任务或数据变成带编号的条目，用边注承载次要信息。不要只是换颜色。",
  },
  {
    title: "更工作台",
    thesis: "保留产品事实，把首屏变成低噪音、高扫描效率的工作台。",
    palette: "沿用当前设计，但提高中性色比例",
    layout:
      "在现有设计基础上做结构变化：顶部紧凑状态条，主体是高密度分组清单，关键操作和统计固定在窄栏或底部。减少装饰性留白，用对齐和分组建立层级。不要只是换颜色。",
  },
  {
    title: "更大胆",
    thesis: "保留产品事实，但用一个明确的视觉装置建立记忆点。",
    palette: "沿用当前设计，但允许一个更强的主色块",
    layout:
      "在现有设计基础上做结构变化：首屏使用一个非标准的视觉装置（超大数字、色块切分、叠层、非对称栅格或图形化进度），让页面有明确的观点。仍然要能用，不要做成展示页。",
  },
  {
    title: "更索引",
    thesis: "保留产品事实，把当前页面重排成可快速定位的索引/档案结构。",
    palette: "沿用当前设计，但减少装饰色",
    layout:
      "在现有设计基础上做结构变化：增加目录/索引栏、编号系统、固定详情栏，把内容变成可跳转的条目。不要只是换颜色。",
  },
  {
    title: "更海报",
    thesis: "保留产品事实，用一句宣言和强对比色带建立更强的视觉记忆。",
    palette: "沿用当前设计，但允许一个高对比主色",
    layout:
      "在现有设计基础上做结构变化：首屏用大字号宣言/关键词、横向色带或错位栅格；内容仍然可用，不要做成纯展示页。",
  },
];

const SYSTEM = `你是 atoms-lite 的 Designer 子 agent，只做视觉探索，不写生产代码。

你的输出是给用户比较的静态概念页，不是最终实现：
- 一个概念 = 一个完整页面，只展示一个方案。不要在一页里并排或堆叠 A/B/C 多个子方案；用户会在不同概念页之间比较。
- 如果需求是修改某个局部/组件，仍然只展示一个完整页面，其中包含该局部的一个方案；不要在一页里放多个局部变体。
- 忽略 notes 里“A/B/C 三方案/并排比较”之类的描述；每个概念只选一个方向实现。
- 每个概念必须是一个完整、自包含的 HTML 文档，CSS 内联在 <style> 里。
- 不引入外部字体、图片、图标库、CDN 或脚本；只用系统字体、CSS 图形、内联 SVG。
- 使用需求里的真实文案和真实数据，不要 lorem ipsum。
- 必须响应式覆盖 360 / 768 / 1280。
- 必须严格按给定的 layout thesis 组织首屏和信息层级，不能只是换色。
- 避免通用卡片网格、居中大标题 + 三张卡、紫蓝渐变、emoji 图标。
- 用排版、细线、留白、色块和抽象线稿建立视觉识别。
- 页面要能在 iframe 里直接渲染，不依赖构建。

designMd 必须包含：
1. 设计主题与关键词
2. 色彩 tokens（背景/文字/强调/边框）
3. 字体与字号层级
4. 间距、圆角、阴影规则
5. 布局与栅格
6. 关键组件语言
7. 响应式规则
8. 实现时不要偏离的 3-5 条约束

只返回 JSON：{ title, thesis, palette, designMd, html }。`;

function briefJson(brief: RequirementsBrief): string {
  return JSON.stringify(brief, null, 2);
}

function paletteText(palette: unknown): string {
  if (!palette) return "";
  if (typeof palette === "string") return palette;
  if (Array.isArray(palette)) {
    return palette.map((item) => paletteText(item)).filter(Boolean).join(" / ");
  }
  if (typeof palette === "object") {
    return Object.entries(palette as Record<string, unknown>)
      .map(([key, value]) => `${key} ${String(value)}`)
      .join(" / ");
  }
  return String(palette);
}

function normalizeConcept(
  raw: z.infer<typeof conceptSchema>,
  seed: DirectionSeed,
): DesignConceptInput {
  return {
    title: (raw.title?.trim() || seed.title).slice(0, 80),
    thesis: (raw.thesis?.trim() || seed.thesis).slice(0, 240),
    palette: (paletteText(raw.palette).trim() || seed.palette).slice(0, 240),
    designMd: raw.designMd.slice(0, 20000),
    html: raw.html.slice(0, 90000),
  };
}

function conceptPrompt({
  seed,
  brief,
  mode,
  current,
  notes,
  compact,
}: {
  seed: DirectionSeed;
  brief: RequirementsBrief;
  mode: "new" | "revision";
  current?: string;
  notes?: string;
  compact?: boolean;
}): string {
  return [
    mode === "revision"
      ? "这是现有项目的 UI 改版。基于当前 DESIGN.md 和用户反馈，按下面的方向做一个结构上不同的新方案。保留产品事实和内容，不要只换颜色。"
      : "这是一个新项目的视觉方向探索。基于需求摘要，严格按下面的方向做一个概念。",
    "",
    `方向名称：${seed.title}`,
    `设计论点：${seed.thesis}`,
    `色彩倾向：${seed.palette}`,
    `布局要求：${seed.layout}`,
    "",
    "需求摘要：",
    briefJson(brief),
    "",
    current ? `当前 DESIGN.md：\n${current.slice(0, 12000)}` : "",
    notes ? `用户补充：\n${notes.slice(0, 4000)}` : "",
    "",
    compact
      ? "这次请更精简：HTML 控制在 100–140 行，只保留首屏、一个主要内容区和页脚，不要为了展示所有数据而堆满页面。designMd 控制在 8–12 行。"
      : "请输出一个完整页面。HTML 控制在 100–160 行，designMd 控制在 8–12 行；designMd 要能直接作为后续实现的约束。",
  ]
    .filter(Boolean)
    .join("\n");
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function generateOne({
  model,
  seed,
  brief,
  mode,
  current,
  notes,
  onUsage,
}: {
  model: LanguageModel;
  seed: DirectionSeed;
  brief: RequirementsBrief;
  mode: "new" | "revision";
  current?: string;
  notes?: string;
  onUsage?: (usage: LanguageModelUsage) => Promise<void> | void;
}): Promise<DesignConceptInput> {
  let lastError: unknown = null;
  // 第一次失败时用更精简的提示重试一次：常见失败原因是 HTML 太长被截断。
  for (const [attempt, compact] of [false, true].entries()) {
    const timeoutMs = attempt === 0 ? 120_000 : 90_000;
    try {
      const request = generateObject({
        model,
        schema: conceptSchema,
        system: SYSTEM,
        prompt: conceptPrompt({ seed, brief, mode, current, notes, compact }),
        temperature: mode === "revision" ? 0.6 : 0.75,
        maxOutputTokens: 24000,
        maxRetries: 0,
        // 概念页主要成本在 HTML；降低推理预算，避免被思考耗尽输出。
        providerOptions: { atomsModel: { reasoningEffort: "low" } },
        abortSignal: AbortSignal.timeout(timeoutMs),
      });
      // 供应商可能不响应 abort；额外用 Promise.race 保证工具能返回。
      request.catch(() => {});
      const result = await withTimeout(
        request,
        timeoutMs + 5_000,
        `设计方向「${seed.title}」`,
      );
      await onUsage?.(result.usage);
      if (!/<\/html>/i.test(result.object.html)) {
        throw new Error("模型返回的 HTML 不完整（缺少 </html>）");
      }
      return normalizeConcept(result.object, seed);
    } catch (error) {
      lastError = error;
      if (!compact) {
        console.error(
          "[designer] concept retry",
          seed.title,
          String(error).slice(0, 400),
        );
      }
    }
  }
  throw lastError;
}

/**
 * 每个方向单独调用一次模型，而不是让一次调用生成全部 3 个概念：
 * 输出更短、失败影响更小，也不会因为一个方向写太长导致整体截断。
 * 并行执行并分别设置硬超时，避免某个供应商请求挂住时整个工具无法返回。
 */
export async function generateDesignConcepts({
  model,
  brief,
  count = 3,
  mode = "new",
  current,
  notes,
  onUsage,
  onConcept,
}: {
  model: LanguageModel;
  brief: RequirementsBrief;
  count?: number;
  mode?: "new" | "revision";
  current?: string;
  notes?: string;
  onUsage?: (usage: LanguageModelUsage) => Promise<void> | void;
  onConcept?: (
    concept: DesignConceptInput,
    index: number,
  ) => Promise<void> | void;
}): Promise<DesignConceptInput[]> {
  const seeds = (
    mode === "revision" ? REVISION_DIRECTIONS : NEW_DIRECTIONS
  ).slice(0, Math.max(2, Math.min(5, count)));

  const results: PromiseSettledResult<DesignConceptInput>[] = new Array(
    seeds.length,
  );
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= seeds.length) return;
      const seed = seeds[index]!;
      try {
        const concept = await generateOne({
          model,
          seed,
          brief,
          mode,
          current,
          notes,
          onUsage,
        });
        // 每成功一个就落库，用户不必等全部草案都完成。
        await onConcept?.(concept, index);
        results[index] = { status: "fulfilled", value: concept };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, seeds.length) }, () => worker()),
  );

  const concepts: DesignConceptInput[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      concepts.push(result.value);
      return;
    }
    const seed = seeds[index]!;
    const detail = result.reason as {
      text?: string;
      finishReason?: string;
      usage?: { outputTokens?: number };
      cause?: unknown;
    };
    const message = String(result.reason).slice(0, 1000);
    console.error(
      "[designer] concept failed",
      seed.title,
      message,
      JSON.stringify({
        finishReason: detail.finishReason,
        outputTokens: detail.usage?.outputTokens,
        text: detail.text?.slice(0, 1600),
        cause: String(detail.cause ?? "").slice(0, 600),
      }),
    );
    errors.push(message);
  });
  if (concepts.length === 0) {
    throw new Error(
      `设计方向生成失败：${errors[0] ?? "模型没有返回可用结果"}`,
    );
  }
  return concepts;
}

export async function refineDesignConcept({
  model,
  brief,
  current,
  feedback,
  onUsage,
}: {
  model: LanguageModel;
  brief: RequirementsBrief;
  current: DesignConceptInput;
  feedback: string;
  onUsage?: (usage: LanguageModelUsage) => Promise<void> | void;
}): Promise<DesignConceptInput> {
  const seed: DirectionSeed = {
    title: current.title,
    thesis: current.thesis,
    palette: current.palette,
    layout: "保留已经成立的部分，只修改用户反馈涉及的区域。",
  };
  const request = generateObject({
    model,
    schema: conceptSchema,
    system: SYSTEM,
    prompt: [
      "只修改下面这一个概念，不要重新发明产品。",
      "",
      "需求摘要：",
      briefJson(brief),
      "",
      `当前概念：${current.title}\n${current.thesis}`,
      `当前色彩：${current.palette}`,
      "",
      "当前 HTML：",
      current.html.slice(0, 60000),
      "",
      "当前 designMd：",
      current.designMd.slice(0, 12000),
      "",
      `用户反馈：${feedback.slice(0, 4000)}`,
      "",
      "保留已经成立的部分，只改反馈涉及的区域；designMd 同步更新。返回同一个 JSON 结构。",
    ].join("\n"),
    temperature: 0.4,
    maxOutputTokens: 20000,
    maxRetries: 0,
    providerOptions: { atomsModel: { reasoningEffort: "low" } },
    abortSignal: AbortSignal.timeout(150_000),
  });
  request.catch(() => {});
  const result = await withTimeout(request, 155_000, "设计微调");
  await onUsage?.(result.usage);
  if (!/<\/html>/i.test(result.object.html)) {
    throw new Error("模型返回的 HTML 不完整（缺少 </html>）");
  }
  return normalizeConcept(result.object, seed);
}
