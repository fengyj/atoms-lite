import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { generateText, stepCountIs, tool } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

// ---------- 配置 ----------
const varsPath = fileURLToPath(new URL("../../apps/worker/.dev.vars", import.meta.url));
const raw = fs.readFileSync(varsPath, "utf8");
const env = Object.fromEntries(
  raw
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

for (const key of ["MODEL_BASE_URL", "MODEL_API_KEY", "MODEL_ID"]) {
  if (!env[key]) throw new Error(`${key} missing in .dev.vars`);
}

const provider = createOpenAICompatible({
  name: "atoms-poc",
  // 允许误把完整路径写进 .dev.vars
  baseURL: env.MODEL_BASE_URL.replace(/\/chat\/completions\/?$/, ""),
  apiKey: env.MODEL_API_KEY,
  // OpenCode Go 的路由要求
  headers: { "x-opencode-session": "poc-05" },
});

const RUNS = Number(process.argv[2] ?? "10");
const TIMEOUT_MS = 180_000;

const SYSTEM = `你是前端工程师，用单个 index.html 实现用户要求的应用。

硬性要求：
- 所有 HTML、CSS、JS 写在一个 index.html 里，不要引用外部文件
- 数据用 localStorage 持久化
- 用 write_file 工具写入 index.html
- 写完后调用 finish 工具

不要输出大段解释文字，直接调用工具。`;

const PROMPT =
  "做一个任务看板：可以新增任务、标记完成、删除任务，数据要保存下来，界面要好看。";

// ---------- 工具（内存版，不依赖沙箱） ----------
function makeTools(state) {
  return {
    write_file: tool({
      description: "写入一个文件（覆盖）",
      inputSchema: z.object({
        path: z.string().describe("文件路径，例如 index.html"),
        content: z.string().describe("完整文件内容"),
      }),
      execute: async ({ path, content }) => {
        state.files.set(path, content);
        return { ok: true, bytes: content.length };
      },
    }),
    list_files: tool({
      description: "列出已写入的文件",
      inputSchema: z.object({}),
      execute: async () => [...state.files.keys()],
    }),
    finish: tool({
      description: "完成实现",
      inputSchema: z.object({ summary: z.string() }),
      execute: async ({ summary }) => ({ done: true, summary }),
    }),
  };
}

function check(html) {
  const out = { hasHtml: false, hasLocalStorage: false, hasAdd: false, hasDelete: false, jsSyntaxOk: false, jsError: null };
  if (typeof html !== "string" || html.length === 0) return out;

  out.hasHtml = /<html[\s>]/i.test(html);
  out.hasLocalStorage = /localStorage/i.test(html);
  out.hasAdd = /(新增|添加|add|create)/i.test(html);
  out.hasDelete = /(删除|delete|remove)/i.test(html);

  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (script?.[1]) {
    try {
      new Function(script[1]);
      out.jsSyntaxOk = true;
    } catch (error) {
      out.jsError = String(error).slice(0, 160);
    }
  }
  return out;
}

async function runOnce(index) {
  const state = { files: new Map() };
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const result = await generateText({
      model: provider(env.MODEL_ID),
      system: SYSTEM,
      prompt: PROMPT,
      tools: makeTools(state),
      stopWhen: stepCountIs(20),
      abortSignal: ac.signal,
    });

    const html = state.files.get("index.html") ?? [...state.files.values()][0] ?? "";
    const toolNames = result.steps.flatMap((s) => s.toolCalls?.map((c) => c.toolName) ?? []);

    return {
      index,
      ok: true,
      ms: Date.now() - started,
      steps: result.steps.length,
      finishReason: result.finishReason,
      toolCalls: toolNames.length,
      toolSequence: toolNames.join(","),
      repeatedWrites: toolNames.filter((n) => n === "write_file").length,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      totalTokens: result.usage?.totalTokens ?? null,
      files: [...state.files.keys()],
      bytes: html.length,
      checks: check(html),
      textTail: (result.text ?? "").slice(-200),
    };
  } catch (error) {
    return {
      index,
      ok: false,
      ms: Date.now() - started,
      error: String(error).slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let i = 1; i <= RUNS; i += 1) {
  process.stdout.write(`run ${i}/${RUNS} ... `);
  const r = await runOnce(i);
  results.push(r);
  console.log(
    r.ok
      ? `${r.ms}ms steps=${r.steps} tools=${r.toolCalls} tokens=${r.totalTokens ?? "?"} syntax=${r.checks.jsSyntaxOk}`
      : `FAILED ${r.ms}ms ${r.error}`,
  );
}

fs.writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2));

const ok = results.filter((r) => r.ok);
const good = ok.filter((r) => r.checks?.hasHtml && r.checks?.jsSyntaxOk && r.checks?.hasLocalStorage);
const avg = (arr, key) => (arr.length ? Math.round(arr.reduce((a, b) => a + (b[key] ?? 0), 0) / arr.length) : 0);

console.log("\n=== 汇总 ===");
console.log(`模型: ${env.MODEL_ID}`);
console.log(`成功调用: ${ok.length}/${RUNS}`);
console.log(`结构完整(html+js+localStorage): ${good.length}/${RUNS}`);
console.log(`平均耗时: ${avg(ok, "ms")}ms`);
console.log(`平均步数: ${avg(ok, "steps")}`);
console.log(`平均工具调用: ${avg(ok, "toolCalls")}`);
console.log(`平均 tokens: ${avg(ok, "totalTokens")}`);
console.log(`写出 index.html: ${ok.filter((r) => r.files?.includes("index.html")).length}/${RUNS}`);
