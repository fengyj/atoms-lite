import { execPreferenceKey } from "@atoms-lite/contracts";
import { tool, type LanguageModel, type LanguageModelUsage, type ToolSet } from "ai";
import { z } from "zod";
import type { RuntimeContext } from "./context";
import { detectHtmlSource, detectTextSource } from "./detector";
import { generateDesignConcepts, refineDesignConcept } from "./designer";
import {
  analyzeExec,
  execInputSchema,
  type ExecInput,
} from "./exec";
import { runSubagent } from "./subagent";
import type { UsageSource } from "./usage";
import type {
  RequirementsBrief,
  WorkspaceClient,
} from "./workspace/client";

const TEMPLATE_ENUM = z.enum(["static", "react-vite", "fullstack-hono"]);
const WORKSPACE_PATH = z
  .string()
  .max(300)
  .describe("必须是 /workspace/... 绝对路径");
// 注意：tool inputSchema 里不要用 .regex()。上游供应商会把 JSON Schema 的
// pattern 判为不可用请求并返回 upstream_unavailable；路径校验放在 execute 里。
const FILE_PATH = z
  .string()
  .max(300)
  .describe("相对路径（如 src/App.tsx）或 /workspace/... 绝对路径");

function absolutePath(path: string): string {
  if (path.startsWith("/workspace/")) return path;
  if (path.startsWith("/")) {
    throw new Error("path must be under /workspace");
  }
  return `/workspace/${path.replace(/^\/+/, "")}`;
}

type ToolFactoryOptions = {
  ws: WorkspaceClient;
  ctx: RuntimeContext;
  model: LanguageModel;
  recordUsage?: (
    source: UsageSource,
    usage: LanguageModelUsage,
  ) => Promise<void> | void;
};

/**
 * 工具注册表：每个工具自己声明何时可用。
 * 不要把 template/runtime 组合写死在 agent 里，否则新增模板会到处改条件。
 */
function predicateList(ctx: RuntimeContext): {
  files: boolean;
  shell: boolean;
  build: boolean;
  packages: boolean;
  api: boolean;
  container: boolean;
} {
  return {
    files: ctx.configured,
    shell: ctx.configured && ctx.runtime === "container",
    build:
      ctx.configured &&
      ctx.runtime === "container" &&
      (ctx.template === "react-vite" || ctx.template === "fullstack-hono"),
    packages:
      ctx.configured &&
      !(ctx.runtime === "container" && ctx.template === "static"),
    api: ctx.configured && ctx.template === "fullstack-hono",
    container: ctx.configured && ctx.runtime === "container",
  };
}

export function createTools({
  ws,
  ctx,
  model,
  recordUsage,
}: ToolFactoryOptions) {
  const caps = predicateList(ctx);
  const tools: ToolSet = {};
  let reviewCalls = 0;

  const review = async ({
    role,
    task,
    files,
    maxFindings,
  }: {
    role: string;
    task: string;
    files?: string[];
    maxFindings?: number;
  }) => {
    if (reviewCalls >= 2) {
      throw new Error("本次运行已经调用过 2 次评审，请直接应用建议或完成实现");
    }
    reviewCalls += 1;
    return runSubagent({
      model,
      ws,
      role,
      task,
      files,
      maxFindings,
      onUsage: (usage) => recordUsage?.("subagent", usage),
    });
  };

  // 需求确认始终可用；pending 阶段它是唯一能推进流程的工具。
  tools.ask_user = tool({
    description:
      "当需求信息不足、会显著改变页面结构/数据模型/视觉方向时，向用户展示向导式问卷卡片：一次一个问题，可前后切换，最后确认 summary。只问产品问题，不要问 runtime/技术栈；根据回答自行推断 recommendedTemplate（内部配置，不展示给用户）。每次最多 3 个问题，可以分多轮继续问。",
    inputSchema: z.object({
      title: z.string().max(80).optional().describe("卡片标题"),
      questions: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            label: z.string().min(1).max(120),
            type: z.enum(["single", "multi", "text"]).default("single"),
            options: z
              .array(
                z.object({
                  value: z.string().min(1).max(40),
                  label: z.string().min(1).max(60),
                  description: z.string().max(120).optional(),
                }),
              )
              .min(2)
              .max(5)
              .optional(),
            required: z.boolean().default(false).describe("用户必须回答；UI 会校验"),
          }),
        )
        .min(1)
        .max(3),
      recommendedTemplate: TEMPLATE_ENUM.describe(
        "内部推断的技术栈，不会展示给用户；pending 阶段用于配置项目。configured 阶段填当前 template（切换用 switch_runtime）",
      ),
      templateReason: z.string().max(200).optional(),
    }).superRefine((value, ctx) => {
      value.questions.forEach((question, index) => {
        if (
          question.type !== "text" &&
          (!question.options || question.options.length < 2)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["questions", index, "options"],
            message: "single/multi 问题至少需要 2 个选项",
          });
        }
      });
    }),
  });

  // 达到单轮工具步数上限时，由 prepareStep 强制调用；客户端展示继续确认卡。
  tools.confirm_continue = tool({
    description:
      "仅由系统在单轮工具步数达到上限时强制调用，不要主动调用。向用户展示继续确认卡，让用户决定是否继续执行剩余步骤。",
    inputSchema: z.object({
      summary: z.string().max(300).optional().describe("本轮已完成的内容摘要"),
      completed: z
        .array(z.string().max(120))
        .max(8)
        .optional()
        .describe("已经完成的关键步骤"),
      remaining: z
        .array(z.string().max(120))
        .max(8)
        .optional()
        .describe("尚未完成的关键步骤"),
    }),
  });

  if (!ctx.configured) return tools;

  tools.list_files = tool({
    description:
      "列出工作区文件（不读内容），返回相对路径，可直接传给 read_file/edit_file。目录可用 path 过滤；不要反复全量列目录。",
    inputSchema: z.object({
      path: z.string().optional().describe("目录，默认 /workspace"),
    }),
    execute: async ({ path }) => {
      const result = await ws.listFiles();
      const base = (path ?? "/workspace")
        .replace(/^\/workspace\/?/, "")
        .replace(/\/$/, "");
      const entries = base
        ? result.entries.filter(
            (entry) =>
              entry.path === base || entry.path.startsWith(`${base}/`),
          )
        : result.entries;
      return { entries };
    },
  });

  tools.read_file = tool({
    description:
      "读取一个文件的内容。修改已有文件前必须先读；默认最多 400 行、约 64KB，大文件用 offset/limit 分段读取，返回 truncated/nextOffset。",
    inputSchema: z.object({
      path: FILE_PATH,
      offset: z.number().int().min(0).default(0).describe("起始行，0-based"),
      limit: z.number().int().min(1).max(2000).default(400),
    }),
    execute: async ({ path, offset, limit }) =>
      ws.readFile(absolutePath(path), offset, limit),
  });

  tools.edit_file = tool({
    description:
      "局部修改已有文件：用 oldString 精确匹配并替换，必须保持原有缩进/空白。oldString 必须唯一；多处匹配时增加上下文或设置 replaceAll。修改已有文件优先用它，避免整文件重写。",
    inputSchema: z.object({
      path: FILE_PATH,
      oldString: z.string().min(1),
      newString: z.string(),
      replaceAll: z.boolean().default(false),
    }),
    execute: async ({ path, oldString, newString, replaceAll }) =>
      ws.editFile(absolutePath(path), oldString, newString, replaceAll),
  });

  tools.write_file = tool({
    description:
      "写入（覆盖）一个文件；内容必须是完整文件。小范围修改用 edit_file；大范围重写、重排或大量替换时直接用 write_file 覆写，避免构造巨大的 oldString。",
    inputSchema: z.object({
      path: FILE_PATH,
      content: z.string().describe("完整文件内容"),
    }),
    execute: async ({ path, content }) =>
      ws.writeFile(absolutePath(path), content),
  });

  if (caps.packages) {
    tools.install_packages = tool({
      description:
        "安装第三方依赖（最多 8 个）。容器项目执行 pnpm add；browser-static 注册 esm.sh 包并注入 importmap。支持 name 或 name@version、@scope/name；不要直接执行 pnpm/npm install。",
      inputSchema: z.object({
        packages: z
          .array(z.string().max(120))
          .min(1)
          .max(8)
          .describe("包名或 name@version，例如 dayjs@1.11.13、chart.js@4；支持 @scope/name；不支持 git/url/tarball"),
      }),
      execute: async ({ packages }) => ws.installPackages(packages),
    });
  }

  if (caps.shell) {
    tools.exec = tool({
      description: `在 /workspace 执行命令。两种结构化形式（二选一）：
1) command: { program, args } 单命令。
2) groups: [{ op:"and"|"or", pipeline:{ commands:[{program,args}], stdout:{path,append} } }]
   - pipeline 内用管道连接：grep -r foo src | head -20
   - groups 之间用 && 或 || 连接
   - stdout 写文件必须用 /workspace 内路径

只读命令和只读管道会自动执行；写文件、重定向、安装、网络、git 写操作、sh/node 脚本会请求用户批准。
复杂脚本请先用 write_file 写到 /workspace/scripts/*.sh，再用 command 执行 sh /workspace/scripts/xxx.sh。
路径必须在 /workspace 内；不要改 .git / .atoms-lite / node_modules / dist。
例：ls | head -20 → groups:[{op:"and",pipeline:{commands:[{program:"ls"},{program:"head",args:["-20"]}]}}]`,
      inputSchema: execInputSchema,
      needsApproval: async (input) => {
        const analysis = analyzeExec(input as ExecInput);
        if (analysis.risk !== "approval") return false;
        const pref = (
          await ws.getExecPreference(execPreferenceKey(input as ExecInput))
        ).decision;
        return pref === null;
      },
      execute: async (input) => {
        const analysis = analyzeExec(input as ExecInput);
        if (analysis.risk === "denied") {
          throw new Error(analysis.reason);
        }
        const pref = (
          await ws.getExecPreference(execPreferenceKey(input as ExecInput))
        ).decision;
        if (pref === "deny") {
          throw new Error(
            "这条命令已被设置为「始终拒绝」。可以在工作台「终端 → 执行偏好」中移除这条规则后再试。",
          );
        }
        return ws.exec(input as ExecInput);
      },
    });
  }

  if (caps.build) {
    tools.build = tool({
      description:
        "按当前模板执行构建（React/全栈必须调用）。一轮修改只构建一次；失败最多修 2 轮。返回 exitCode 和日志。",
      inputSchema: z.object({}),
      execute: async () => ws.build(),
    });
  }

  if (caps.container) {
    tools.upgrade_instance = tool({
      description:
        "容器实例不够用（构建 OOM、超时、磁盘不足）时升级：basic → standard-1 → standard-2。不可降级。",
      inputSchema: z.object({
        reason: z.string().max(200).optional().describe("可选，记录为什么需要升级"),
      }),
      execute: async ({ reason }) => ws.upgradeInstance(reason),
    });
  }

  tools.start_preview = tool({
    description:
      "启动（或确认）预览服务。构建型项目应在 build 成功后再调用；browser 项目为空操作，全栈项目会重启 Node 服务。",
    inputSchema: z.object({}),
    execute: async () => ws.startPreview(),
  });

  tools.create_version = tool({
    description:
      "把当前工作区保存为一个版本：容器项目走 git commit + 快照，browser 项目走内容哈希；无变更时返回 skipped。完成实现后必须调用一次；迁移期间请先 finish_migration。",
    inputSchema: z.object({
      summary: z.string().min(1).max(200).describe("一句中文描述"),
    }),
    execute: async ({ summary }) => ws.createVersion(summary),
  });

  tools.manage_requirements = tool({
    description:
      "保存或确认需求摘要。action=save：需求清楚后保存结构化 brief；action=confirm：用户已在 ask_user 中确认后调用。未 confirmed 前不要写生产代码或生成设计。",
    inputSchema: z.object({
      action: z.enum(["save", "confirm"]),
      audience: z.string().max(600).optional().describe("目标用户/使用场景"),
      job: z.string().max(800).optional().describe("最重要的任务"),
      mustHave: z.array(z.string().max(200)).max(12).optional(),
      constraints: z.array(z.string().max(200)).max(12).optional(),
      success: z.array(z.string().max(200)).max(12).optional(),
      visual: z.array(z.string().max(200)).max(12).optional(),
      nonGoals: z.array(z.string().max(200)).max(12).optional(),
      summary: z.string().max(1200).optional().describe("一段话总结"),
      notes: z.string().max(500).optional().describe("确认时用户补充的说明"),
    }),
    execute: async (input) => {
      if (input.action === "confirm") {
        const result = await ws.confirmRequirements();
        return { ...result, notes: input.notes ?? null };
      }
      if (!input.audience?.trim() || !input.job?.trim() || !input.summary?.trim()) {
        throw new Error("action=save 需要 audience、job、summary");
      }
      const brief: RequirementsBrief = {
        audience: input.audience.trim(),
        job: input.job.trim(),
        mustHave: input.mustHave ?? [],
        constraints: input.constraints ?? [],
        success: input.success ?? [],
        visual: input.visual ?? [],
        nonGoals: input.nonGoals ?? [],
        summary: input.summary.trim(),
      };
      return ws.saveRequirements(brief);
    },
  });

  tools.manage_design = tool({
    description:
      "管理设计草案。action=create：需求 confirmed 后生成 2-5 个结构不同的静态草案（默认 3）；refine：按反馈微调一个；list：列出；select：选中一个（approved）；apply：把选中草案写成 DESIGN.md（applied）。生成/更新由对话触发，工作台「设计」tab 只负责展示。",
    inputSchema: z.object({
      action: z.enum(["create", "refine", "list", "select", "apply"]),
      mode: z.enum(["new", "revision"]).optional().describe("create 时使用，默认 new"),
      count: z.number().int().min(2).max(5).optional().describe("create 时使用，2-5 个，默认 3"),
      notes: z.string().max(2000).optional().describe("create/select 时的补充说明"),
      designId: z.string().max(100).optional().describe("refine/select/apply 的目标草案"),
      feedback: z.string().max(4000).optional().describe("refine 时的用户反馈"),
    }),
    execute: async (input) => {
      if (input.action === "list") return ws.listDesigns();
      if (input.action === "select") {
        if (!input.designId) throw new Error("action=select 需要 designId");
        return ws.selectDesign(input.designId, input.notes);
      }
      if (input.action === "apply") return ws.applyDesign(input.designId);
      if (input.action === "refine") {
        if (!input.designId || !input.feedback?.trim()) {
          throw new Error("action=refine 需要 designId 和 feedback");
        }
        const req = await ws.getRequirements();
        if (!req?.requirements) throw new Error("还没有需求摘要");
        const detail = await ws.getDesign(input.designId);
        if (!detail.design) throw new Error("design not found");
        const concept = await refineDesignConcept({
          model,
          brief: req.requirements.brief,
          current: {
            title: detail.design.title,
            thesis: detail.design.thesis,
            palette: detail.design.palette,
            designMd: detail.design.designMd,
            html: detail.design.html,
          },
          feedback: input.feedback.trim(),
          onUsage: (usage) => recordUsage?.("designer", usage),
        });
        return ws.updateDesign(input.designId, concept);
      }

      const mode = input.mode ?? "new";
      const count = input.count ?? 3;
      const req = await ws.getRequirements();
      if (!req?.requirements || req.requirements.status !== "confirmed") {
        throw new Error(
          "需求摘要还没有 confirmed。先用 ask_user 请用户确认，再调用 manage_requirements(action=confirm)。",
        );
      }

      let current: string | undefined;
      if (mode === "revision") {
        const list = await ws.listDesigns();
        if (list.selectedId) {
          const detail = await ws.getDesign(list.selectedId);
          current = detail.design?.designMd;
        }
        if (!current) {
          const file = await ws
            .readFile("/workspace/DESIGN.md")
            .catch(() => null);
          current = file?.content;
        }
      }

      const designs: Array<{
        id: string;
        title: string;
        thesis: string;
        palette: string;
        status: string;
      }> = [];
      const concepts = await generateDesignConcepts({
        model,
        brief: req.requirements.brief,
        count,
        mode,
        current,
        notes: input.notes,
        onUsage: (usage) => recordUsage?.("designer", usage),
        onConcept: async (concept) => {
          const saved = await ws.createDesign(concept);
          designs.push(saved.design);
        },
      });
      return { action: "create", mode, requested: count, generated: concepts.length, designs };
    },
  });

  const switchTemplateEnum =
    ctx.runtime === "container"
      ? z.enum(["react-vite", "fullstack-hono"])
      : TEMPLATE_ENUM;
  tools.switch_runtime = tool({
    description:
      "当需求发生实质变化（如新增登录/数据库/多人协作），需要切换模板/runtime 时调用。判断需要就调用；客户端会展示确认卡，只有用户确认后才执行。切换会把旧文件归档到 _sandbox_migration、重置工作区，并把旧版本标记为 archived（不可 checkout）；迁移完成后需 finish_migration → create_version。只允许切到容量不低于当前的环境：browser < container/basic < standard-1 < standard-2；不能从 container 切到 browser，container 项目不能选 static，也不能降低实例档位。",
    inputSchema: z.object({
      template: switchTemplateEnum,
      reason: z.string().min(1).max(200),
    }),
  });

  if (ctx.migration?.active) {
    tools.list_migration_files = tool({
      description:
        "列出旧环境迁移备份中的文件（只读）。先看 manifest，不要整体复制。",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe("相对前缀，如 src；不要传 /workspace 或 _sandbox_migration"),
      }),
      execute: async ({ path }) => {
        const prefix = path
          ?.replace(/^\/+/, "")
          .replace(/^workspace\//, "")
          .replace(/^_sandbox_migration\//, "")
          .replace(/^files\//, "");
        const result = await ws.listMigrationFiles();
        const entries = prefix
          ? result.entries.filter((entry) => entry.path.startsWith(prefix))
          : result.entries;
        return { entries, manifest: result.manifest };
      },
    });

    tools.read_migration_file = tool({
      description:
        "读取旧环境备份中的一个文本文件。默认最多 400 行，truncated 表示还有内容；二进制文件请用 copy_migration_file。",
      inputSchema: z.object({
        path: z.string().max(300).describe("备份内路径，例如 src/App.tsx 或 manifest.json"),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(2000).default(400),
      }),
      execute: async ({ path, offset, limit }) =>
        ws.readMigrationFile(path, offset, limit),
    });

    tools.copy_migration_file = tool({
      description:
        "把旧环境备份中的文件直接复制到新工作区，适合图片/字体等二进制或不想读入上下文的大文件。目标路径必须是 /workspace/...；如果目标已存在会被覆盖。",
      inputSchema: z.object({
        from: z.string().max(300).describe("备份内的相对路径，例如 src/App.tsx"),
        to: WORKSPACE_PATH.describe(
          "新工作区绝对路径，例如 /workspace/public/hero.png",
        ),
      }),
      execute: async ({ from, to }) => {
        if (!/^\/workspace\//.test(to)) {
          throw new Error("to must be an absolute path under /workspace");
        }
        return ws.copyMigrationFile(from, to);
      },
    });

    tools.finish_migration = tool({
      description:
        "迁移完成，清理 _sandbox_migration 备份（不可撤销）。清理后请 create_version。",
      inputSchema: z.object({}),
      execute: async () => ws.finishMigration(),
    });
  }

  const scanSources = async (
    paths?: string[],
    maxFindings = 15,
  ): Promise<{
    scanned: number;
    findings: Array<Record<string, unknown>>;
    total: number;
  }> => {
    const listed = await ws.listFiles();
    const source = /\.(tsx?|jsx?|css|html?|vue|svelte)$/i;
    let entries = listed.entries
      .map((entry) => entry.path)
      .filter((path) => source.test(path));
    if (paths?.length) {
      entries = entries.filter((path) =>
        paths.some((prefix) => {
          const normalized = prefix
            .replace(/^\/+/, "")
            .replace(/^workspace\//, "");
          return (
            path === normalized || path.startsWith(`${normalized}/`)
          );
        }),
      );
    } else {
      entries = entries.filter(
        (path) =>
          path.startsWith("src/") ||
          path === "index.html" ||
          path === "styles.css" ||
          path === "server/index.js",
      );
    }
    entries = entries.slice(0, 30);

    const findings: Array<Record<string, unknown>> = [];
    let scanned = 0;
    let bytes = 0;
    for (const path of entries) {
      if (bytes > 120_000) break;
      try {
        const file = await ws.readFile(`/workspace/${path}`);
        bytes += file.content.length;
        const result = /\.html?$/i.test(path)
          ? detectHtmlSource(file.content, path)
          : detectTextSource(file.content, path);
        scanned += 1;
        for (const finding of result) {
          findings.push({ ...finding, file: path });
        }
      } catch {
        // 单个文件读取失败不阻塞其它文件
      }
    }
    return {
      scanned,
      findings: findings.slice(0, maxFindings),
      total: findings.length,
    };
  };

  tools.design_check = tool({
    description:
      "用 Impeccable 确定性 detector 扫描生成项目的源码，检查 AI slop、小字、对比度、间距、嵌套卡片等问题。适合在 build 后、create_version 前调用；返回最多 30 条 findings。它不是完整视觉回归。",
    inputSchema: z.object({
      paths: z
        .array(z.string().max(300))
        .max(30)
        .optional()
        .describe("要扫描的文件或目录前缀；省略时扫描 src/index.html/styles.css"),
      maxFindings: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ paths, maxFindings }) =>
      scanSources(paths, maxFindings),
  });

  tools.subagent = tool({
    description:
      "召唤一个只读的子 agent 做专项评审或分析。适合代码审查、设计审查、需求分析；子 agent 不能写文件/执行命令。本轮合计最多 2 次评审，单次 45 秒超时。",
    inputSchema: z.object({
      role: z.string().min(1).max(60).describe("角色，例如 code_reviewer / design_reviewer"),
      task: z.string().min(1).max(1000),
      files: z
        .array(z.string().max(300))
        .max(8)
        .optional()
        .describe("要检查的文件，相对或 /workspace 绝对路径；省略时自动选择"),
      maxFindings: z.number().int().min(1).max(6).default(5),
    }),
    execute: async ({ role, task, files, maxFindings }) =>
      review({ role, task, files, maxFindings }),
  });

  tools.code_review = tool({
    description:
      "让代码审查子 agent 检查正确性、类型、边界、API 和安全性。只读，本轮与其它评审合计最多 2 次，单次 45 秒。建议在 build 通过后、create_version 前调用一次；小修小改不要调用。",
    inputSchema: z.object({
      task: z.string().min(1).max(1000).default("审查当前实现的主要风险"),
      files: z
        .array(z.string().max(300))
        .max(8)
        .optional()
        .describe("要检查的文件，相对或 /workspace 绝对路径；省略时自动选择"),
      maxFindings: z.number().int().min(1).max(6).default(5),
    }),
    execute: async ({ task, files, maxFindings }) =>
      review({ role: "code_reviewer", task, files, maxFindings }),
  });

  tools.design_review = tool({
    description:
      "设计审查：先运行 Impeccable 确定性 detector 扫描源码，再让只读设计子 agent 综合检查信息层级、间距、颜色、响应式和状态设计。只读，本轮与其它评审合计最多 2 次，单次 45 秒。建议在首次预览后调用一次；小修小改不要调用。",
    inputSchema: z.object({
      task: z.string().min(1).max(1000).default("审查当前界面的设计质量"),
      files: z
        .array(z.string().max(300))
        .max(8)
        .optional()
        .describe("要检查的文件，相对或 /workspace 绝对路径；省略时自动选择"),
      maxFindings: z.number().int().min(1).max(6).default(5),
    }),
    execute: async ({ task, files, maxFindings }) => {
      const deterministic = await scanSources(files, 10);
      const report = await review({
        role: "design_reviewer",
        task: `${task}\n\n确定性 detector findings（优先核对，不要重复泛泛而谈）:\n${JSON.stringify(
          deterministic.findings,
        ).slice(0, 5000)}`,
        files,
        maxFindings,
      });
      return { deterministic, review: report };
    },
  });

  tools.finish = tool({
    description:
      "完成本次实现。调用前应已 build/start_preview/create_version；迁移期间先 finish_migration。summary 用一句中文描述本次结果。",
    inputSchema: z.object({
      summary: z.string().min(1).max(500).describe("一句中文描述本次结果"),
    }),
    execute: async ({ summary }) => ({ ok: true, summary }),
  });

  return tools;
}

export type AgentTools = ReturnType<typeof createTools>;
