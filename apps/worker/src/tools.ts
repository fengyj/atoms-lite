import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import type { RuntimeContext } from "./context";
import { runSubagent } from "./subagent";
import type { WorkspaceClient } from "./workspace/client";

const TEMPLATE_ENUM = z.enum(["static", "react-vite", "fullstack-hono"]);

type ToolFactoryOptions = {
  ws: WorkspaceClient;
  ctx: RuntimeContext;
  model: LanguageModel;
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
    packages: ctx.configured,
    api: ctx.configured && ctx.template === "fullstack-hono",
    container: ctx.configured && ctx.runtime === "container",
  };
}

export function createTools({ ws, ctx, model }: ToolFactoryOptions) {
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
    return runSubagent({ model, ws, role, task, files, maxFindings });
  };

  // 需求确认始终可用；pending 阶段它是唯一能推进流程的工具。
  tools.ask_user = tool({
    description:
      "当需求信息不足、会显著改变页面结构/数据模型/视觉方向时，向用户展示一张可交互的问卷卡片。不要问技术栈；在 pending 阶段必须用它确认需求并给出推荐模板。最多 3 个问题，允许用户直接使用推荐项。",
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
            required: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(3),
      recommendedTemplate: TEMPLATE_ENUM.optional().describe(
        "给用户的推荐技术栈；pending 阶段应填写",
      ),
      templateReason: z.string().max(200).optional(),
    }),
  });

  if (!ctx.configured) return tools;

  tools.list_files = tool({
    description:
      "列出工作区文件（不读内容）。目录可用 path 过滤；不要反复全量列目录。",
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
      "读取一个文件的内容。修改已有文件前必须先读；只读需要的部分，不要一次读多个大文件。",
    inputSchema: z.object({
      path: z.string().describe("绝对路径，例如 /workspace/app.js"),
    }),
    execute: async ({ path }) => ws.readFile(path),
  });

  tools.edit_file = tool({
    description:
      "局部修改已有文件：用 oldString 精确匹配并替换。oldString 必须唯一；多处匹配时增加上下文或设置 replaceAll。修改已有文件优先用它，避免整文件重写。",
    inputSchema: z.object({
      path: z.string().describe("绝对路径，例如 /workspace/src/App.tsx"),
      oldString: z.string().min(1),
      newString: z.string(),
      replaceAll: z.boolean().default(false),
    }),
    execute: async ({ path, oldString, newString, replaceAll }) =>
      ws.editFile(path, oldString, newString, replaceAll),
  });

  tools.write_file = tool({
    description:
      "写入（覆盖）一个文件；内容必须是完整文件。新建文件优先用它；修改已有文件尽量只改目标区域，不要重写无关内容。",
    inputSchema: z.object({
      path: z.string().describe("绝对路径，例如 /workspace/index.html"),
      content: z.string().describe("完整文件内容"),
    }),
    execute: async ({ path, content }) => ws.writeFile(path, content),
  });

  if (caps.packages) {
    tools.install_packages = tool({
      description:
        "安装第三方依赖。容器项目执行 pnpm add；browser-static 注册 esm.sh 包并注入 importmap。不要直接执行 pnpm/npm install。",
      inputSchema: z.object({
        packages: z.array(z.string()).min(1).max(8),
      }),
      execute: async ({ packages }) => ws.installPackages(packages),
    });
  }

  if (caps.shell) {
    tools.exec = tool({
      description:
        "在 /workspace 执行受限命令（只读为主：ls/cat/grep/git/wc/head/tail/test）。不支持 bash/curl/node/find。能用文件工具就不要用 exec。",
      inputSchema: z.object({
        program: z.string(),
        args: z.array(z.string()).default([]),
        cwd: z.string().optional(),
      }),
      execute: async ({ program, args, cwd }) => ws.exec({ program, args, cwd }),
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
        reason: z.string().max(200).optional(),
      }),
      execute: async () => ws.upgradeInstance(),
    });
  }

  tools.start_preview = tool({
    description:
      "启动（或确认）预览服务。构建型项目应在 build 成功后再调用。",
    inputSchema: z.object({}),
    execute: async () => ws.startPreview(),
  });

  tools.create_version = tool({
    description:
      "把当前工作区保存为一个版本（git commit + 快照）。完成实现后必须调用一次。",
    inputSchema: z.object({
      summary: z.string().min(1).max(200).describe("一句中文描述"),
    }),
    execute: async ({ summary }) => ws.createVersion(summary),
  });

  tools.switch_runtime = tool({
    description:
      "当用户需求发生实质变化（例如新增登录/数据库/多人协作），需要把项目切换到另一个模板/runtime 时调用。会先确认再迁移；只允许切换到容量不低于当前的 runtime。不要在没有用户明确同意时调用。",
    inputSchema: z.object({
      template: TEMPLATE_ENUM,
      reason: z.string().min(1).max(200),
    }),
  });

  if (ctx.migration?.active) {
    tools.list_migration_files = tool({
      description:
        "列出旧环境迁移备份中的文件（只读）。先看 manifest，不要整体复制。",
      inputSchema: z.object({
        path: z.string().optional().describe("只列出该前缀下的文件"),
      }),
      execute: async ({ path }) => {
        const result = await ws.listMigrationFiles();
        const entries = path
          ? result.entries.filter((entry) => entry.path.startsWith(path))
          : result.entries;
        return { entries, manifest: result.manifest };
      },
    });

    tools.read_migration_file = tool({
      description:
        "读取旧环境备份中的一个文本文件。二进制文件请用 copy_migration_file。",
      inputSchema: z.object({
        path: z.string(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(2000).default(400),
      }),
      execute: async ({ path, offset, limit }) =>
        ws.readMigrationFile(path, offset, limit),
    });

    tools.copy_migration_file = tool({
      description:
        "把旧环境备份中的文件直接复制到新工作区，适合图片/字体等二进制或不想读入上下文的大文件。目标路径必须是 /workspace/...。",
      inputSchema: z.object({
        from: z.string().describe("备份内的相对路径"),
        to: z.string().describe("新工作区绝对路径，例如 /workspace/public/hero.png"),
      }),
      execute: async ({ from, to }) => ws.copyMigrationFile(from, to),
    });

    tools.finish_migration = tool({
      description:
        "迁移完成，清理 _sandbox_migration 备份。清理后请 create_version。",
      inputSchema: z.object({}),
      execute: async () => ws.finishMigration(),
    });
  }

  tools.subagent = tool({
    description:
      "召唤一个只读的子 agent 做专项评审或分析。适合代码审查、设计审查、需求分析；子 agent 不能写文件/执行命令，最多调用 2 次。",
    inputSchema: z.object({
      role: z.string().min(1).max(60).describe("角色，例如 code_reviewer / design_reviewer"),
      task: z.string().min(1).max(1000),
      files: z.array(z.string()).max(8).optional(),
      maxFindings: z.number().int().min(1).max(6).default(5),
    }),
    execute: async ({ role, task, files, maxFindings }) =>
      review({ role, task, files, maxFindings }),
  });

  tools.code_review = tool({
    description:
      "让代码审查子 agent 检查正确性、类型、边界、API 和安全性。建议在 build 通过后、create_version 前调用一次；小修小改不要调用。",
    inputSchema: z.object({
      task: z.string().min(1).max(1000).default("审查当前实现的主要风险"),
      files: z.array(z.string()).max(8).optional(),
      maxFindings: z.number().int().min(1).max(6).default(5),
    }),
    execute: async ({ task, files, maxFindings }) =>
      review({ role: "code_reviewer", task, files, maxFindings }),
  });

  tools.design_review = tool({
    description:
      "让设计审查子 agent 检查信息层级、间距、颜色、响应式和状态设计。建议在首次预览后调用一次；小修小改不要调用。",
    inputSchema: z.object({
      task: z.string().min(1).max(1000).default("审查当前界面的设计质量"),
      files: z.array(z.string()).max(8).optional(),
      maxFindings: z.number().int().min(1).max(6).default(5),
    }),
    execute: async ({ task, files, maxFindings }) =>
      review({ role: "design_reviewer", task, files, maxFindings }),
  });

  tools.finish = tool({
    description:
      "完成本次实现。调用前应已 build/start_preview/create_version。summary 用一句中文描述本次结果。",
    inputSchema: z.object({
      summary: z.string().max(500).default(""),
    }),
    execute: async ({ summary }) => ({ ok: true, summary }),
  });

  return tools;
}

export type AgentTools = ReturnType<typeof createTools>;
