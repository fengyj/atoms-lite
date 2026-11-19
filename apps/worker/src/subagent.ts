import { generateText, type LanguageModel } from "ai";
import type { WorkspaceClient } from "./workspace/client";

export type SubagentFinding = {
  severity: "P0" | "P1" | "P2";
  category: string;
  file?: string;
  line?: number;
  issue: string;
  recommendation: string;
};

export type SubagentReport = {
  summary: string;
  findings: SubagentFinding[];
  role: string;
};

const ROLE_PROMPTS: Record<string, string> = {
  code_reviewer: `你是资深代码审查员。只做只读审查，不要重写代码。
重点：TypeScript 类型、React 状态与副作用、构建错误、边界条件、API 输入校验、错误/空态、安全与明显的性能问题。
输出 JSON：{"summary":"一句话","findings":[{"severity":"P0|P1|P2","category":"...","file":"...","line":1,"issue":"...","recommendation":"..."}]}
最多 6 条，按严重程度排序。不要把风格偏好当 P0。`,
  design_reviewer: `你是产品设计师。只做只读评审，不要重写代码。
重点：信息层级、间距、字体、颜色对比、响应式、空态/错误态、可访问性、原创性。
输出 JSON：{"summary":"一句话","findings":[{"severity":"P0|P1|P2","category":"...","file":"...","line":1,"issue":"...","recommendation":"..."}]}
最多 6 条，每条建议必须可执行，不要泛泛说“可以更好看”。`,
};

const MAX_FILE_BYTES = 12 * 1024;
const MAX_TOTAL_BYTES = 48 * 1024;
const MAX_FILES = 8;

function fallback(path: string): boolean {
  return /\.(tsx?|jsx?|css|html|json|md)$/i.test(path);
}

function parseReport(text: string, role: string): SubagentReport {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        summary?: string;
        findings?: SubagentFinding[];
      };
      return {
        role,
        summary: parsed.summary ?? "评审完成",
        findings: Array.isArray(parsed.findings)
          ? parsed.findings.slice(0, 6)
          : [],
      };
    } catch {
      // 模型没有按 JSON 返回时保留文本摘要
    }
  }
  return { role, summary: text.slice(0, 1200), findings: [] };
}

export async function runSubagent({
  model,
  ws,
  role,
  task,
  files,
  maxFindings = 5,
}: {
  model: LanguageModel;
  ws: WorkspaceClient;
  role: string;
  task: string;
  files?: string[];
  maxFindings?: number;
}): Promise<SubagentReport> {
  let paths = files?.slice(0, MAX_FILES) ?? [];
  if (paths.length === 0) {
    try {
      const listed = await ws.listFiles();
      paths = listed.entries
        .map((entry) => entry.path)
        .filter(fallback)
        .filter(
          (path) =>
            path.startsWith("src/") ||
            path === "index.html" ||
            path === "server/index.js",
        )
        .slice(0, MAX_FILES);
    } catch {
      paths = [];
    }
  }

  let total = 0;
  const bundle: string[] = [];
  for (const path of paths) {
    try {
      const absolute = path.startsWith("/") ? path : `/workspace/${path}`;
      const result = await ws.readFile(absolute);
      const content = result.content.slice(0, MAX_FILE_BYTES);
      if (total + content.length > MAX_TOTAL_BYTES) break;
      total += content.length;
      bundle.push(`--- ${path} ---\n${content}`);
    } catch {
      // 单个文件缺失不影响评审
    }
  }

  const system =
    ROLE_PROMPTS[role] ??
    `你是一个只读的${role}。只返回建议，不修改文件。输出 JSON：{"summary":"...","findings":[{"severity":"P0|P1|P2","category":"...","file":"...","issue":"...","recommendation":"..."}]}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const result = await generateText({
      model,
      system,
      prompt: `${task}\n\n最多输出 ${maxFindings} 条发现。\n\n${bundle.join("\n\n")}`,
      maxOutputTokens: 1500,
      abortSignal: controller.signal,
    });
    return parseReport(result.text, role);
  } finally {
    clearTimeout(timeout);
  }
}
