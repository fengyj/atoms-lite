/** 结构化 exec 输入：单命令，或 pipeline + &&/|| 分组。 */
export type ExecCommandInput = {
  program: string;
  args?: string[];
};

export type ExecPipelineInput = {
  commands: ExecCommandInput[];
  stdout?: {
    path: string;
    append?: boolean;
  };
};

export type ExecGroupInput = {
  op?: "and" | "or";
  pipeline: ExecPipelineInput;
};

export type ExecInput = {
  cwd?: string;
  command?: ExecCommandInput;
  groups?: ExecGroupInput[];
};

/**
 * 审批偏好的稳定 key。
 * - 只包含会改变执行结果的字段，忽略模型可能多传的字段
 * - 固定字段顺序，避免 JSON.stringify 属性顺序不同导致 key 不稳定
 */
export function execPreferenceKey(input: ExecInput): string {
  const command = (item: ExecCommandInput) => ({
    program: item.program,
    args: item.args ?? [],
  });
  return JSON.stringify({
    cwd: input.cwd ?? "",
    command: input.command ? command(input.command) : null,
    groups:
      input.groups?.map((group) => ({
        op: group.op ?? "and",
        pipeline: {
          commands: group.pipeline.commands.map(command),
          stdout: group.pipeline.stdout
            ? {
                path: group.pipeline.stdout.path,
                append: group.pipeline.stdout.append ?? false,
              }
            : null,
        },
      })) ?? null,
  });
}
