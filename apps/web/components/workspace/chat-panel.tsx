"use client";

import type { ChatStatus, ToolUIPart, UIMessage } from "ai";
import {
  Crosshair,
  Loader2,
  MessageSquare,
  Slash,
  Sparkles,
  X,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/workspace/panel";
import {
  AskUserCard,
  type AskUserInput,
  type AskUserPayload,
} from "@/components/workspace/ask-user-card";
import { SwitchRuntimeCard } from "@/components/workspace/switch-runtime-card";
import type { ElementSelection } from "@/lib/element-selection";

/** 空态示例需求：五子棋 */
const SAMPLE_PROMPT =
  "做一个五子棋：双人对战、自动判断胜负、支持重新开局，界面简洁好看。";

const COMMANDS = [
  {
    name: "/design-review",
    label: "设计审查",
    description: "detector + design_review，只读评审",
    prompt:
      "请先调用 design_check 扫描当前源码，再调用 design_review 做一次设计审查。只输出问题、证据、优先级和具体修改建议，不要改代码。",
  },
  {
    name: "/code-review",
    label: "代码审查",
    description: "检查正确性、边界和安全问题",
    prompt:
      "请调用 code_review 检查当前实现，重点看正确性、边界、错误处理和安全性。只输出问题与建议，不要改代码。",
  },
  {
    name: "/polish",
    label: "收尾打磨",
    description: "间距、层级、状态和文案",
    prompt:
      "请在不改变产品意图和现有视觉方向的前提下做一次 polish：修复信息层级、间距、状态和文案问题，完成后 build、start_preview、create_version。",
  },
] as const;

export function ChatPanel({
  className,
  messages,
  status,
  busy,
  onSubmitText,
  onStop,
  onApproval,
  onAskUser,
  onSwitchRuntime,
  fallbackTemplate,
  selection,
  onClearSelection,
}: {
  className?: string;
  /** Agent 会话消息（真实数据） */
  messages: UIMessage[];
  status: ChatStatus;
  /** 有请求在跑（含服务端续流），此时提交按钮变成停止 */
  busy: boolean;
  onSubmitText: (text: string) => void;
  onStop: () => void;
  /** 工具审批（approval-requested）的回应 */
  onApproval: (id: string, approved: boolean) => void;
  onAskUser: (
    id: string,
    input: AskUserInput,
    payload: AskUserPayload
  ) => Promise<void>;
  onSwitchRuntime: (
    id: string,
    input: { template: "static" | "react-vite" | "fullstack-hono"; reason: string },
    confirmed: boolean
  ) => Promise<void>;
  fallbackTemplate?: "static" | "react-vite" | "fullstack-hono";
  selection?: ElementSelection | null;
  onClearSelection?: () => void;
}) {
  const handleSubmit = ({ text }: { text: string }) => {
    const trimmed = text.trim();
    if (busy) {
      // 运行中提交 = 停止当前回合
      onStop();
      return;
    }
    if (!trimmed) return;
    const command = COMMANDS.find((item) => item.name === trimmed);
    onSubmitText(command?.prompt ?? trimmed);
  };

  return (
    <Panel
      title="对话"
      icon={<MessageSquare />}
      className={className}
      bodyClassName="overflow-hidden"
      actions={
        <Badge variant="outline" className="font-normal">
          单角色
        </Badge>
      }
    >
      <div className="flex h-full flex-col">
        <Conversation className="flex-1">
          <ConversationContent
            className={`gap-5 px-3 py-4${messages.length === 0 ? " min-h-full justify-center" : ""}`}
          >
            {messages.length === 0 ? (
              <ConversationEmptyState className="gap-4">
                <span className="grid size-10 place-items-center rounded-full border border-border bg-muted text-muted-foreground">
                  <Sparkles className="size-4" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">从一个需求开始</h3>
                  <p className="text-xs text-muted-foreground">
                    Agent 会在沙箱里实现、运行并保存版本。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!busy) onSubmitText(SAMPLE_PROMPT);
                  }}
                  className="max-w-sm rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent"
                >
                  {SAMPLE_PROMPT}
                  <span className="mt-1 block text-3xs text-muted-foreground">
                    点击直接发送这条示例需求
                  </span>
                </button>
              </ConversationEmptyState>
            ) : null}

            {messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent className="space-y-3">
                  {message.parts.map((part, index) =>
                    renderPart(
                      part,
                      index,
                      onApproval,
                      onAskUser,
                      onSwitchRuntime,
                      fallbackTemplate
                    )
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-3">
          {selection ? (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-2xs">
              <Crosshair className="size-3 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-mono">
                已选中 {selection.selector}
              </span>
              {selection.text ? (
                <span className="hidden min-w-0 max-w-32 truncate text-muted-foreground sm:block">
                  {selection.text}
                </span>
              ) : null}
              <button
                type="button"
                aria-label="取消选中元素"
                onClick={onClearSelection}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : null}
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder={
                  selection
                    ? "描述想怎么改选中的元素…"
                    : "描述你想做的应用，或粘贴需求…"
                }
              />
            </PromptInputBody>
            <PromptInputFooter className="justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground"
                    disabled={busy}
                  >
                    <Slash className="size-3.5" />
                    命令
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {COMMANDS.map((command) => (
                    <DropdownMenuItem
                      key={command.name}
                      className="flex flex-col items-start gap-0.5"
                      onSelect={() => onSubmitText(command.prompt)}
                    >
                      <span className="flex w-full items-center gap-2">
                        <code className="font-mono text-2xs text-primary">
                          {command.name}
                        </code>
                        <span className="text-xs">{command.label}</span>
                      </span>
                      <span className="text-3xs text-muted-foreground">
                        {command.description}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <PromptInputSubmit status={busy ? "streaming" : status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </Panel>
  );
}


/** 工具卡片只展示关键信息，避免把整个文件内容铺满对话 */
function truncate(value: string, max = 1200) {
  return value.length > max ? `${value.slice(0, max)}\n… (${value.length} chars)` : value;
}

function displayInput(tool: ToolUIPart): unknown {
  const name = tool.type.replace(/^tool-/, "");
  const input = tool.input as Record<string, unknown> | undefined;
  if (!input || typeof input !== "object") return tool.input;

  if (name === "write_file") {
    return {
      path: input.path,
      bytes: typeof input.content === "string" ? input.content.length : undefined,
    };
  }
  if (name === "read_file") {
    return { path: input.path };
  }
  if (name === "build") {
    return {};
  }
  return tool.input;
}

function displayOutput(tool: ToolUIPart): unknown {
  const name = tool.type.replace(/^tool-/, "");
  const output = tool.output as Record<string, unknown> | undefined;
  if (!output || typeof output !== "object") return tool.output;

  if (name === "read_file" && typeof output.content === "string") {
    return { content: truncate(output.content), truncated: output.truncated };
  }
  if (name === "exec" || name === "build") {
    return {
      skipped: output.skipped,
      exitCode: output.exitCode,
      durationMs: output.durationMs,
      stdout: typeof output.stdout === "string" ? truncate(output.stdout, 2400) : output.stdout,
      stderr: typeof output.stderr === "string" ? truncate(output.stderr, 900) : output.stderr,
    };
  }
  return tool.output;
}

/** 单个消息 part 的渲染：text / reasoning / tool-* */
function renderPart(
  part: UIMessage["parts"][number],
  index: number,
  onApproval: (id: string, approved: boolean) => void,
  onAskUser: (
    id: string,
    input: AskUserInput,
    payload: AskUserPayload
  ) => Promise<void>,
  onSwitchRuntime: (
    id: string,
    input: { template: "static" | "react-vite" | "fullstack-hono"; reason: string },
    confirmed: boolean
  ) => Promise<void>,
  fallbackTemplate: "static" | "react-vite" | "fullstack-hono" | undefined
) {
  if (part.type === "text") {
    return <MessageResponse key={index}>{part.text}</MessageResponse>;
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning
        key={index}
        defaultOpen={false}
        isStreaming={part.state === "streaming"}
      >
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "tool-ask_user") {
    const tool = part as ToolUIPart;
    const input = tool.input as AskUserInput | undefined;
    if (tool.state === "output-available" || tool.state === "output-error") {
      return <AskUserResult key={index} tool={tool} />;
    }
    if (!input?.questions?.length) {
      return <ToolPending key={index} label="正在整理问题…" />;
    }
    return (
      <AskUserCard
        key={index}
        toolCallId={tool.toolCallId}
        input={input}
        fallbackTemplate={fallbackTemplate}
        onSubmit={(payload) => onAskUser(tool.toolCallId, input, payload)}
      />
    );
  }

  if (part.type === "tool-switch_runtime") {
    const tool = part as ToolUIPart;
    const input = tool.input as
      | { template: "static" | "react-vite" | "fullstack-hono"; reason: string }
      | undefined;
    if (tool.state === "output-available" || tool.state === "output-error") {
      return <SwitchRuntimeResult key={index} tool={tool} />;
    }
    if (!input?.template) {
      return <ToolPending key={index} label="正在准备切换环境…" />;
    }
    return (
      <SwitchRuntimeCard
        key={index}
        template={input.template}
        currentTemplate={fallbackTemplate}
        reason={input.reason}
        onConfirm={() => onSwitchRuntime(tool.toolCallId, input, true)}
        onCancel={() => void onSwitchRuntime(tool.toolCallId, input, false)}
      />
    );
  }

  if (part.type.startsWith("tool-")) {
    const tool = part as ToolUIPart;
    return (
      <div key={index} data-tool={tool.type} data-state={tool.state}>
        <Tool>
          <ToolHeader type={tool.type} state={tool.state} />
          <ToolContent>
            {tool.input !== undefined ? <ToolInput input={displayInput(tool)} /> : null}
            <ToolOutput output={displayOutput(tool)} errorText={tool.errorText} />
          </ToolContent>
        </Tool>

        {tool.state === "approval-requested" && tool.approval?.id ? (
          <Confirmation approval={tool.approval} state={tool.state}>
            <ConfirmationTitle>需要确认</ConfirmationTitle>
            <ConfirmationRequest>
              即将执行 <code className="font-mono text-xs">{tool.type.slice("tool-".length)}</code>
            </ConfirmationRequest>
            <ConfirmationActions>
              <ConfirmationAction
                variant="outline"
                size="sm"
                onClick={() => onApproval(tool.approval!.id, false)}
              >
                拒绝
              </ConfirmationAction>
              <ConfirmationAction
                size="sm"
                onClick={() => onApproval(tool.approval!.id, true)}
              >
                批准
              </ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>
        ) : null}
      </div>
    );
  }

  return null;
}


function ToolPending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-2xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {label}
    </div>
  );
}

function AskUserResult({ tool }: { tool: ToolUIPart }) {
  if (tool.state === "output-error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
        问卷失败：{tool.errorText ?? "未知错误"}
      </div>
    );
  }
  const output = (tool.output ?? {}) as {
    skipped?: boolean;
    cancelled?: boolean;
    template?: string;
  };
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-2xs text-muted-foreground">
      {output.cancelled
        ? "用户取消了问卷，将按默认方案继续。"
        : output.skipped
          ? "已跳过，使用推荐项开始。"
          : "需求已确认，开始生成。"}
    </div>
  );
}

function SwitchRuntimeResult({ tool }: { tool: ToolUIPart }) {
  if (tool.state === "output-error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
        切换失败：{tool.errorText ?? "未知错误"}
      </div>
    );
  }
  const output = (tool.output ?? {}) as {
    cancelled?: boolean;
    prepared?: boolean;
    template?: string;
  };
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-2xs text-muted-foreground">
      {output.cancelled
        ? "已取消环境切换。"
        : `已切换并准备迁移${output.template ? `：${output.template}` : ""}。`}
    </div>
  );
}
