import type {
  ExecCommandInput,
  ExecInput,
} from "@atoms-lite/contracts";
import { z } from "zod";

export type { ExecInput };

const execCommandSchema = z.object({
  program: z.string().min(1).max(40),
  args: z.array(z.string().max(500)).max(64).default([]),
});

const execPipelineSchema = z.object({
  commands: z.array(execCommandSchema).min(1).max(8),
  stdout: z
    .object({
      path: z.string().min(1).max(300),
      append: z.boolean().default(false),
    })
    .optional(),
});

const execGroupSchema = z.object({
  op: z.enum(["and", "or"]).default("and"),
  pipeline: execPipelineSchema,
});

/**
 * 注意：这里不要用 .regex()。上游供应商会把 JSON Schema 的 pattern
 * 判为不可用请求并返回 upstream_unavailable；路径校验在 analyzeExec 里做。
 */
export const execInputSchema = z.object({
  cwd: z
    .string()
    .max(200)
    .optional()
    .describe("工作目录，默认 /workspace；只接受 /workspace 或其子目录"),
  command: execCommandSchema
    .optional()
    .describe("单命令模式：{ program, args }"),
  groups: z
    .array(execGroupSchema)
    .min(1)
    .max(8)
    .optional()
    .describe(
      "管道/组合模式：pipeline.commands 内用管道连接；groups 之间用 op=and/or 连接",
    ),
});

const SAFE_PROGRAMS = new Set([
  "ls",
  "cat",
  "grep",
  "rg",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "cut",
  "tr",
  "pwd",
  "echo",
  "printf",
  "basename",
  "dirname",
  "realpath",
  "stat",
  "file",
  "du",
  "df",
  "tree",
  "diff",
  "cmp",
  "md5sum",
  "sha256sum",
  "base64",
  "date",
  "which",
  "test",
  "true",
  "false",
  "sed",
  "git",
  "find",
]);

const APPROVABLE_PROGRAMS = new Set([
  ...SAFE_PROGRAMS,
  "mkdir",
  "cp",
  "mv",
  "rm",
  "touch",
  "chmod",
  "chown",
  "ln",
  "tar",
  "unzip",
  "zip",
  "curl",
  "wget",
  "node",
  "pnpm",
  "npx",
  "npm",
  "python3",
  "jq",
  "awk",
  "xargs",
  "timeout",
  "env",
  "tee",
  "install",
  "patch",
  // 复杂脚本：先 write_file 写成 /workspace/scripts/*.sh，再用 sh 执行。
  "sh",
  "bash",
]);

const DENIED_PROGRAMS = new Set([
  "sudo",
  "su",
  "mount",
  "umount",
  "chroot",
  "nsenter",
  "docker",
  "podman",
  "kubectl",
  "systemctl",
  "service",
  "iptables",
  "nft",
  "dd",
  "mkfs",
  "fdisk",
  "parted",
  "reboot",
  "shutdown",
  "poweroff",
  "passwd",
  "useradd",
  "usermod",
  "groupadd",
  "visudo",
  "crontab",
  "at",
  "nc",
  "ncat",
  "socat",
  "zsh",
  "fish",
]);

export const SAFE_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "rev-parse",
  "ls-files",
  "grep",
]);

const PROTECTED_PATH_RE = /(^|\/)(\.git|\.atoms|\.atoms-lite)(\/|$)/;
const FORBIDDEN_ABSOLUTE_RE = /^\/(proc|sys|dev|etc|root)(\/|$)/;

const FIND_RISKY_ARGS = new Set([
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-delete",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
]);

function quote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isWorkspacePath(value: string): boolean {
  return (
    value === "/workspace" ||
    (value.startsWith("/workspace/") &&
      !value.includes("..") &&
      !PROTECTED_PATH_RE.test(value))
  );
}

function checkArg(arg: string): void {
  if (arg.startsWith("../") || arg.includes("/../")) {
    throw new Error("path outside /workspace is not allowed");
  }
  if (PROTECTED_PATH_RE.test(arg)) {
    throw new Error(`internal path is not allowed: ${arg}`);
  }
  if (FORBIDDEN_ABSOLUTE_RE.test(arg)) {
    throw new Error(`path outside /workspace is not allowed: ${arg}`);
  }
  const eq = arg.indexOf("=");
  const value = eq >= 0 ? arg.slice(eq + 1) : arg;
  if (value.startsWith("/") && !isWorkspacePath(value)) {
    throw new Error(`path outside /workspace is not allowed: ${value}`);
  }
}

function checkArgs(program: string, args: string[]): void {
  if (program === "sed") {
    // sed 脚本里包含 /；只检查显式文件参数，--sandbox 会禁用 e/r/w。
    for (const arg of args) {
      if (arg.startsWith("--file=")) checkArg(arg.slice("--file=".length));
      else if (arg.startsWith("/")) checkArg(arg);
    }
    return;
  }
  let patternSkipped = false;
  for (const arg of args) {
    if (arg === "--") continue;
    if (
      (program === "grep" || program === "rg") &&
      !patternSkipped &&
      !arg.startsWith("-")
    ) {
      patternSkipped = true;
      continue;
    }
    checkArg(arg);
  }
}

function isInPlace(arg: string): boolean {
  return (
    arg === "-i" ||
    arg.startsWith("-i.") ||
    arg === "--in-place" ||
    arg.startsWith("--in-place=")
  );
}

function analyzeCommand(command: ExecCommandInput): {
  command: ExecCommandInput;
  needsApproval: boolean;
  reason: string;
} {
  const program = command.program.trim();
  if (!program) throw new Error("program is required");
  if (DENIED_PROGRAMS.has(program)) {
    throw new Error(`program not allowed: ${program}`);
  }
  const args = [...(command.args ?? [])];
  const safe = SAFE_PROGRAMS.has(program);
  if (!safe && !APPROVABLE_PROGRAMS.has(program)) {
    throw new Error(
      `unknown program: ${program}；复杂脚本请先 write_file 到 /workspace/scripts/，再用 sh 执行`,
    );
  }

  let needsApproval = !safe;
  let reason = safe ? "" : `「${program}」可能需要修改文件或访问网络`;

  if (program === "sh" || program === "bash") {
    if (args.length !== 1 || !isWorkspacePath(args[0] ?? "")) {
      throw new Error(
        `${program} 只能执行 /workspace 内的脚本文件，例如 ${program} /workspace/scripts/check.sh`,
      );
    }
    needsApproval = true;
    reason = "执行 shell 脚本，请确认脚本内容";
  }

  if (program === "git") {
    const sub = args.find((arg) => !arg.startsWith("-"));
    if (args[0]?.startsWith("-")) {
      needsApproval = true;
      reason = "git 全局参数需要确认";
    } else if (sub && SAFE_GIT_SUBCOMMANDS.has(sub)) {
      needsApproval = false;
      reason = "";
    } else if (sub) {
      needsApproval = true;
      reason = `git ${sub} 可能修改仓库`;
    }
  }

  if (program === "sed") {
    if (args.some(isInPlace)) {
      needsApproval = true;
      reason = "sed -i 会修改文件";
    }
    if (!args.includes("--sandbox")) args.unshift("--sandbox");
  }

  if (program === "find") {
    if (
      args.some(
        (arg) =>
          FIND_RISKY_ARGS.has(arg) ||
          arg.startsWith("-exec") ||
          arg.startsWith("-ok"),
      )
    ) {
      needsApproval = true;
      reason = "find 的 -exec/-delete 等参数会执行或删除文件";
    }
  }

  if (safe) checkArgs(program, args);

  return {
    command: { program, args },
    needsApproval,
    reason,
  };
}

function compileCommand(command: ExecCommandInput): string {
  return [command.program, ...(command.args ?? [])].map(quote).join(" ");
}

export type ExecRisk = "safe" | "approval" | "denied";

export type ExecAnalysis =
  | { risk: "safe"; script: string; reason?: string }
  | { risk: "approval"; script: string; reason: string }
  | { risk: "denied"; reason: string };

/**
 * 把一个结构化 exec 输入编译成可执行的 shell 脚本，并判断风险。
 * 只读命令/管道是 safe；写文件、未知程序、重定向需要 approval；
 * 明确禁止的程序或路径返回 denied。
 */
export function analyzeExec(input: ExecInput): ExecAnalysis {
  try {
    const forms = [input.command, input.groups].filter(
      (value) => value !== undefined,
    );
    if (forms.length !== 1) {
      return {
        risk: "denied",
        reason: "必须且只能提供 command / groups 之一",
      };
    }

    if (input.command) {
      const analyzed = analyzeCommand(input.command);
      return analyzed.needsApproval
        ? {
            risk: "approval",
            script: compileCommand(analyzed.command),
            reason: analyzed.reason || "这条命令需要确认",
          }
        : { risk: "safe", script: compileCommand(analyzed.command) };
    }

    const groups = input.groups ?? [];
    if (groups.length === 0) {
      return { risk: "denied", reason: "groups 不能为空" };
    }

    let needsApproval = false;
    let reason = "";
    const parts: string[] = [];
    for (const [index, group] of groups.entries()) {
      const commands = group.pipeline.commands;
      if (commands.length === 0) {
        return { risk: "denied", reason: "pipeline.commands 不能为空" };
      }
      const compiled: string[] = [];
      for (const command of commands) {
        const analyzed = analyzeCommand(command);
        if (analyzed.needsApproval) {
          needsApproval = true;
          reason ||= analyzed.reason || "包含需要确认的命令";
        }
        compiled.push(compileCommand(analyzed.command));
      }
      let pipeline = compiled.join(" | ");
      const stdout = group.pipeline.stdout;
      if (stdout) {
        const path = stdout.path.trim();
        if (!isWorkspacePath(path)) {
          return {
            risk: "denied",
            reason: `stdout 必须是 /workspace 内的路径：${path}`,
          };
        }
        needsApproval = true;
        reason ||= "会把输出写入文件";
        pipeline += ` ${stdout.append ? ">>" : ">"} ${quote(path)}`;
      }
      if (index > 0) parts.push(group.op === "or" ? "||" : "&&");
      parts.push(pipeline);
    }

    const script = parts.join(" ");
    return needsApproval
      ? { risk: "approval", script, reason }
      : { risk: "safe", script };
  } catch (error) {
    return {
      risk: "denied",
      reason: String(error instanceof Error ? error.message : error).slice(
        0,
        300,
      ),
    };
  }
}

export function isRiskyExec(input: ExecInput): boolean {
  return analyzeExec(input).risk === "approval";
}
