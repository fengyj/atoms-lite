import type {
  ExecCommandInput,
  ExecGroupInput,
  ExecInput,
} from "@atoms-lite/contracts";

function quote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatCommand(command: ExecCommandInput): string {
  return [command.program, ...(command.args ?? [])].map(quote).join(" ");
}

function formatGroup(group: ExecGroupInput): string {
  let pipeline = group.pipeline.commands.map(formatCommand).join(" | ");
  const stdout = group.pipeline.stdout;
  if (stdout) {
    pipeline += ` ${stdout.append ? ">>" : ">"} ${quote(stdout.path)}`;
  }
  return pipeline;
}

function asExecInput(input: unknown): ExecInput | null {
  if (!input || typeof input !== "object") return null;
  return input as ExecInput;
}

/** 把结构化 exec 输入渲染成用户能读的命令。 */
export function formatExecInput(input: unknown): string {
  const exec = asExecInput(input);
  if (!exec) return typeof input === "string" ? input : "";
  if (exec.command) return formatCommand(exec.command);
  if (exec.groups?.length) {
    return exec.groups
      .map((group, index) => {
        const prefix =
          index === 0 ? "" : group.op === "or" ? "|| " : "&& ";
        return `${prefix}${formatGroup(group)}`;
      })
      .join(" ");
  }
  return JSON.stringify(input, null, 2);
}

const WRITE_PROGRAMS = new Set([
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
  "awk",
  "xargs",
  "tee",
  "install",
  "patch",
  "sh",
  "bash",
]);

/** 给审批卡用的简短风险说明。 */
export function describeExecRisk(input: unknown): string {
  const exec = asExecInput(input);
  if (!exec) return "这条命令需要确认。";
  if (exec.groups?.some((group) => group.pipeline.stdout)) {
    return "这条命令会把输出写入文件，请确认路径。";
  }
  const programs = [
    ...(exec.command ? [exec.command.program] : []),
    ...(exec.groups ?? []).flatMap((group) =>
      group.pipeline.commands.map((command) => command.program),
    ),
  ];
  if (programs.some((program) => WRITE_PROGRAMS.has(program))) {
    return "这条命令可能修改文件、安装依赖或访问网络。";
  }
  if (programs.some((program) => program === "git")) {
    return "这条 git 命令可能修改仓库，请确认子命令。";
  }
  return "这条命令需要确认。";
}
