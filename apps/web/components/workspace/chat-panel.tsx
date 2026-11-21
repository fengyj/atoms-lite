"use client";

import { Fragment, useRef, useState } from "react";
import type { ChatStatus, ToolUIPart, UIMessage } from "ai";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Crosshair,
  Loader2,
  MessageSquare,
  RefreshCw,
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
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { describeExecRisk, formatExecInput } from "@/lib/exec";
import { templateLabel, type AgentErrorInfo } from "@/lib/agent";

/** 空态示例需求：五子棋 */
const SAMPLE_PROMPT =
  "做一个五子棋：双人对战、自动判断胜负、支持重新开局，界面简洁好看。";

type ChatCommand =
  | {
      name: string;
      label: string;
      description: string;
      action: "retry" | "compact";
    }
  | {
      name: string;
      label: string;
      description: string;
      prompt: string;
    };

const COMMANDS: ChatCommand[] = [
  {
    name: "/retry",
    label: "重试上一轮",
    description: "按当前上下文重新生成上一条回复，不新增消息",
    action: "retry",
  },
  {
    name: "/compact",
    label: "压缩会话",
    description: "把较早的对话总结成更短的上下文，保留最近消息",
    action: "compact",
  },
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
];

function isQuotaErrorMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  return message.parts.some(
    (part) =>
      part.type === "text" &&
      (part.text.includes('"error":"DAILY_TOKEN_LIMIT"') ||
        part.text.includes("今日模型额度已用完（") ||
        part.text.includes("今日模型额度已用完，")),
  );
}

export function ChatPanel({
  className,
  messages,
  status,
  busy,
  quotaBlocked = false,
  onSubmitText,
  onStop,
  onApproval,
  onAskUser,
  onSwitchRuntime,
  onContinue,
  fallbackTemplate,
  selection,
  onClearSelection,
  error,
  onDismissError,
  onRetryError,
  onRetry,
  onCompact,
  notice,
  onDismissNotice,
}: {
  className?: string;
  /** Agent 会话消息（真实数据） */
  messages: UIMessage[];
  status: ChatStatus;
  /** 有请求在跑（含服务端续流），此时提交按钮变成停止 */
  busy: boolean;
  /** 今日额度已用完：禁用输入，但仍允许停止当前回合 */
  quotaBlocked?: boolean;
  onSubmitText: (text: string) => void;
  onStop: () => void;
  /** 工具审批（approval-requested）的回应 */
  onApproval: (
    id: string,
    approved: boolean,
    options?: { remember?: "allow" | "deny"; input?: unknown }
  ) => void;
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
  onContinue: (id: string, cont: boolean) => void;
  fallbackTemplate?: "static" | "react-vite" | "fullstack-hono";
  selection?: ElementSelection | null;
  onClearSelection?: () => void;
  error?: AgentErrorInfo | null;
  onDismissError?: () => void;
  onRetryError?: () => void;
  onRetry?: () => void;
  onCompact?: () => Promise<void> | void;
  notice?: string | null;
  onDismissNotice?: () => void;
}) {
  const handleSubmit = ({ text }: { text: string }) => {
    const trimmed = text.trim();
    if (busy) {
      // 运行中提交 = 停止当前回合
      onStop();
      return;
    }
    if (quotaBlocked) return;
    if (!trimmed) return;
    const [name, ...rest] = trimmed.split(/\s+/);
    const command = COMMANDS.find((item) => item.name === name);
    if (!command) {
      onSubmitText(trimmed);
      return;
    }
    if ("action" in command) {
      if (command.action === "retry") onRetry?.();
      else void onCompact?.();
      return;
    }
    // 命令后面的文字直接追加到指令后，不加额外标签。
    const extra = rest.join(" ").trim();
    onSubmitText(extra ? `${command.prompt}\n\n${extra}` : command.prompt);
  };

  const visibleMessages = messages.filter((message) => !isQuotaErrorMessage(message));

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
            className={`gap-5 px-3 py-4${visibleMessages.length === 0 ? " min-h-full justify-center" : ""}`}
          >
            {visibleMessages.length === 0 ? (
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

            {(() => {
              let previousTimestamp: number | null = null;
              return visibleMessages.map((message, messageIndex) => {
                const active =
                  busy && messageIndex === visibleMessages.length - 1;
                const timestamp = messageTimestamp(message);
                const showTime =
                  timestamp !== null &&
                  (previousTimestamp === null ||
                    timestamp - previousTimestamp >= 5 * 60 * 1000);
                if (timestamp !== null) previousTimestamp = timestamp;
                const emptyAssistant =
                  message.role === "assistant" &&
                  !active &&
                  !message.parts.some((part) => part.type !== "step-start");
                return (
                  <Fragment key={message.id}>
                    {showTime ? <TimeSeparator timestamp={timestamp} /> : null}
                    <Message from={message.role}>
                      <MessageContent className="space-y-3">
                        {emptyAssistant ? (
                          <EmptyAssistantNotice onRetry={onRetryError} />
                        ) : message.role === "assistant" ? (
                          <AssistantParts
                            parts={message.parts}
                            active={active}
                            onApproval={onApproval}
                            onAskUser={onAskUser}
                            onSwitchRuntime={onSwitchRuntime}
                            onContinue={onContinue}
                            fallbackTemplate={fallbackTemplate}
                          />
                        ) : (
                          message.parts.map((part, index) =>
                            renderPart(
                              part,
                              index,
                              onApproval,
                              onAskUser,
                              onSwitchRuntime,
                              onContinue,
                              active,
                              fallbackTemplate
                            )
                          )
                        )}
                      </MessageContent>
                    </Message>
                  </Fragment>
                );
              });
            })()}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-3">
          <PromptInputProvider>
            <PromptComposer
              busy={busy}
              status={status}
              quotaBlocked={quotaBlocked}
              selection={selection}
              onClearSelection={onClearSelection}
              submit={handleSubmit}
              error={error}
              onDismissError={onDismissError}
              onRetryError={onRetryError}
              notice={notice}
              onDismissNotice={onDismissNotice}
            />
          </PromptInputProvider>
        </div>
      </div>
    </Panel>
  );
}

function AgentErrorBanner({
  error,
  onDismiss,
  onRetry,
}: {
  error: AgentErrorInfo;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-2 border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-2xs"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-destructive">{error.title}</p>
          <p className="mt-0.5 leading-5 text-muted-foreground">{error.hint}</p>
          <details className="mt-1">
            <summary className="cursor-pointer select-none text-3xs text-muted-foreground hover:text-foreground">
              技术细节
            </summary>
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-3xs leading-4 text-muted-foreground">
              {error.detail.slice(0, 800)}
            </pre>
          </details>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭错误提示"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 rounded-full px-2 text-2xs"
            onClick={onDismiss}
          >
            关闭
          </Button>
        ) : null}
        {onRetry ? (
          <Button
            type="button"
            size="sm"
            className="h-6 rounded-full px-2.5 text-2xs"
            onClick={onRetry}
          >
            <RefreshCw className="size-3" />
            重试
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyAssistantNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 border border-dashed border-border bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>这次回复没有返回内容。</span>
      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 rounded-full px-2 text-2xs"
          onClick={onRetry}
        >
          <RefreshCw className="size-3" />
          重试
        </Button>
      ) : null}
    </div>
  );
}

function PromptComposer({
  busy,
  status,
  quotaBlocked,
  selection,
  onClearSelection,
  submit,
  error,
  onDismissError,
  onRetryError,
  notice,
  onDismissNotice,
}: {
  busy: boolean;
  status: ChatStatus;
  quotaBlocked: boolean;
  selection?: ElementSelection | null;
  onClearSelection?: () => void;
  submit: (message: { text: string }) => void;
  error?: AgentErrorInfo | null;
  onDismissError?: () => void;
  onRetryError?: () => void;
  notice?: string | null;
  onDismissNotice?: () => void;
}) {
  const { textInput } = usePromptInputController();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const value = textInput.value.trim();
  const menuOpen =
    !dismissed &&
    !busy &&
    value.startsWith("/") &&
    !value.includes(" ") &&
    !value.includes("\n");
  const matches = menuOpen
    ? COMMANDS.filter(
        (command) =>
          command.name.startsWith(value.toLowerCase()) ||
          (value.length > 1 && command.label.includes(value.slice(1)))
      )
    : [];
  const active = Math.min(activeIndex, Math.max(0, matches.length - 1));

  const insertCommand = (command: (typeof COMMANDS)[number]) => {
    if (busy) return;
    // 只插入命令名，给用户补充范围/约束的机会；再按一次回车才执行。
    textInput.setInput(`${command.name} `);
    setDismissed(false);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      wrapRef.current?.querySelector("textarea")?.focus();
    });
  };

  return (
    <div ref={wrapRef} className="relative">
      {menuOpen ? (
        <div
          role="listbox"
          aria-label="命令"
          className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-lg border border-border bg-popover shadow-xl shadow-black/30"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-3xs text-muted-foreground">
            <span>命令</span>
            <span>选中后可继续输入</span>
          </div>
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              没有匹配的命令
            </p>
          ) : (
            matches.map((command, index) => (
              <button
                key={command.name}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertCommand(command)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                  index === active ? "bg-accent" : ""
                }`}
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
              </button>
            ))
          )}
        </div>
      ) : null}

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

      {quotaBlocked ? (
        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-2xs text-amber-700">
          今日模型额度已用完，输入已暂停。明日额度恢复后可以继续。
        </div>
      ) : null}

      {notice ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-success/30 bg-success/5 px-2.5 py-2 text-2xs text-success">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 leading-5">{notice}</span>
          {onDismissNotice ? (
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="关闭提示"
              className="text-success/70 transition-colors hover:text-success"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <AgentErrorBanner
          error={error}
          onDismiss={onDismissError}
          onRetry={onRetryError}
        />
      ) : null}

      <PromptInput onSubmit={submit}>
        <PromptInputBody>
          <PromptInputTextarea
            disabled={quotaBlocked}
            placeholder={
              selection
                ? "描述想怎么改选中的元素…"
                : "描述你想做的应用，输入 / 查看命令…"
            }
            onChange={() => {
              setDismissed(false);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (menuOpen && matches.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => (index + 1) % matches.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex(
                    (index) => (index - 1 + matches.length) % matches.length
                  );
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDismissed(true);
                  return;
                }
                if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                  event.preventDefault();
                  const selected = matches[active];
                  if (selected) insertCommand(selected);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
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
                  onSelect={() => insertCommand(command)}
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
          <PromptInputSubmit
            status={busy ? "streaming" : status}
            disabled={quotaBlocked && !busy}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
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

/** 找出最后一条非空 text，作为“最终回复”；之前的工具/思考收进过程块。 */
function finalTextIndex(parts: UIMessage["parts"]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part && part.type === "text" && part.text.trim()) return index;
  }
  return -1;
}

function isPinnedCard(
  part: UIMessage["parts"][number],
  active: boolean,
): boolean {
  if (
    part.type === "tool-ask_user" ||
    part.type === "tool-switch_runtime" ||
    part.type === "tool-confirm_continue"
  ) {
    // 等待用户操作的卡片必须露出来；提交后作为普通工具调用折叠。
    const state = (part as ToolUIPart).state;
    return (
      state !== "output-available" &&
      state !== "output-error" &&
      state !== "output-denied"
    );
  }
  // 当前回合的 exec 错误直接露出，方便用户去「执行偏好」移除规则；
  // 历史回合的错误仍折叠，避免聊天记录被旧错误刷屏。
  if (
    active &&
    part.type === "tool-exec" &&
    (part as ToolUIPart).state === "output-error"
  ) {
    return true;
  }
  return (
    part.type.startsWith("tool-") &&
    (part as ToolUIPart).state === "approval-requested"
  );
}

function AssistantParts({
  parts,
  active,
  onApproval,
  onAskUser,
  onSwitchRuntime,
  onContinue,
  fallbackTemplate,
}: {
  parts: UIMessage["parts"];
  active: boolean;
  onApproval: (
    id: string,
    approved: boolean,
    options?: { remember?: "allow" | "deny"; input?: unknown }
  ) => void;
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
  onContinue: (id: string, cont: boolean) => void;
  fallbackTemplate: "static" | "react-vite" | "fullstack-hono" | undefined;
}) {
  const finalIndex = finalTextIndex(parts);
  const finalPart = finalIndex >= 0 ? (parts[finalIndex] ?? null) : null;
  const pinned = parts.filter((part) => isPinnedCard(part, active));
  const processParts = parts.filter(
    (part, index) =>
      index !== finalIndex && part.type !== "step-start" && !isPinnedCard(part, active)
  );
  const toolCount = processParts.filter((part) =>
    part.type.startsWith("tool-")
  ).length;
  const reasoningCount = processParts.filter(
    (part) => part.type === "reasoning"
  ).length;
  const streaming = processParts.some((part) => {
    if (part.type === "reasoning") return part.state === "streaming";
    if (!part.type.startsWith("tool-")) return false;
    const tool = part as ToolUIPart;
    return tool.state !== "output-available" && tool.state !== "output-error";
  });

  return (
    <>
      {processParts.length ? (
        <ProcessGroup
          parts={processParts}
          active={active}
          toolCount={toolCount}
          reasoningCount={reasoningCount}
          streaming={streaming}
          onApproval={onApproval}
          onAskUser={onAskUser}
          onSwitchRuntime={onSwitchRuntime}
          onContinue={onContinue}
          fallbackTemplate={fallbackTemplate}
        />
      ) : null}
      {pinned.map((part, index) =>
        renderPart(
          part,
          index,
          onApproval,
          onAskUser,
          onSwitchRuntime,
          onContinue,
          active,
          fallbackTemplate
        )
      )}
      {finalPart?.type === "text" ? (
        <MessageResponse>{finalPart.text}</MessageResponse>
      ) : null}
    </>
  );
}

function ProcessGroup({
  parts,
  active,
  toolCount,
  reasoningCount,
  streaming,
  onApproval,
  onAskUser,
  onSwitchRuntime,
  onContinue,
  fallbackTemplate,
}: {
  parts: UIMessage["parts"];
  active: boolean;
  toolCount: number;
  reasoningCount: number;
  streaming: boolean;
  onApproval: (
    id: string,
    approved: boolean,
    options?: { remember?: "allow" | "deny"; input?: unknown }
  ) => void;
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
  onContinue: (id: string, cont: boolean) => void;
  fallbackTemplate: "static" | "react-vite" | "fullstack-hono" | undefined;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    toolCount || reasoningCount
      ? `${reasoningCount} 次思考 · ${toolCount} 次工具调用`
      : "过程";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ChevronDown
            className={`size-3.5 shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
          <span>{summary}</span>
          {streaming ? (
            <Loader2 className="ml-auto size-3.5 animate-spin" />
          ) : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 border-l border-border/60 pl-3">
        {parts.map((part, index) =>
          renderPart(
            part,
            index,
            onApproval,
            onAskUser,
            onSwitchRuntime,
            onContinue,
            active,
            fallbackTemplate
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 单个消息 part 的渲染：text / reasoning / tool-* */
function renderPart(
  part: UIMessage["parts"][number],
  index: number,
  onApproval: (
    id: string,
    approved: boolean,
    options?: { remember?: "allow" | "deny"; input?: unknown }
  ) => void,
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
  onContinue: (id: string, cont: boolean) => void,
  active: boolean,
  fallbackTemplate: "static" | "react-vite" | "fullstack-hono" | undefined
) {
  if (part.type === "text") {
    return <MessageResponse key={index}>{part.text}</MessageResponse>;
  }

  if (part.type === "reasoning") {
    const interrupted = !active && part.state === "streaming";
    return (
      <Reasoning
        key={index}
        defaultOpen={false}
        isStreaming={!interrupted && part.state === "streaming"}
      >
        {interrupted ? (
          <ReasoningTrigger
            getThinkingMessage={() => <p>思考已中断</p>}
          />
        ) : (
          <ReasoningTrigger />
        )}
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

  if (part.type === "tool-confirm_continue") {
    const tool = part as ToolUIPart;
    const input = tool.input as
      | { summary?: string; completed?: string[]; remaining?: string[] }
      | undefined;
    if (tool.state === "output-available" || tool.state === "output-error") {
      return <ContinueResult key={index} tool={tool} />;
    }
    return (
      <ContinueCard
        key={index}
        input={input}
        onContinue={(cont) => onContinue(tool.toolCallId, cont)}
      />
    );
  }

  if (part.type.startsWith("tool-")) {
    const tool = part as ToolUIPart;
    return (
      <div key={index} data-tool={tool.type} data-state={tool.state}>
        <Tool>
          <ToolHeader
            type={tool.type}
            state={tool.state}
            interrupted={
              !active &&
              (tool.state === "input-streaming" ||
                tool.state === "input-available")
            }
          />
          <ToolContent>
            {tool.input !== undefined ? <ToolInput input={displayInput(tool)} /> : null}
            <ToolOutput output={displayOutput(tool)} errorText={tool.errorText} />
          </ToolContent>
        </Tool>

        {tool.state === "approval-requested" && tool.approval?.id ? (
          <Confirmation approval={tool.approval} state={tool.state}>
            <ConfirmationTitle>
              {tool.type === "tool-exec" ? "需要确认：执行命令" : "需要确认"}
            </ConfirmationTitle>
            <ConfirmationRequest>
              {tool.type === "tool-exec" ? (
                <div className="space-y-2">
                  <p className="text-2xs leading-5 text-muted-foreground">
                    {describeExecRisk(tool.input)}
                  </p>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 font-mono text-2xs leading-5">
                    {formatExecInput(tool.input)}
                  </pre>
                  <p className="text-3xs text-muted-foreground">
                    「始终允许 / 始终拒绝」会记住这条命令；可以在工作台「终端 → 执行偏好」中移除。
                  </p>
                </div>
              ) : (
                <>
                  即将执行{" "}
                  <code className="font-mono text-xs">
                    {tool.type.slice("tool-".length)}
                  </code>
                </>
              )}
            </ConfirmationRequest>
            <ConfirmationActions className="flex-wrap">
              {tool.type === "tool-exec" ? (
                <>
                  <ConfirmationAction
                    variant="outline"
                    size="sm"
                    onClick={() => onApproval(tool.approval!.id, false)}
                  >
                    拒绝
                  </ConfirmationAction>
                  <ConfirmationAction
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onApproval(tool.approval!.id, false, {
                        remember: "deny",
                        input: tool.input,
                      })
                    }
                  >
                    始终拒绝
                  </ConfirmationAction>
                  <ConfirmationAction
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onApproval(tool.approval!.id, true, {
                        remember: "allow",
                        input: tool.input,
                      })
                    }
                  >
                    始终允许
                  </ConfirmationAction>
                  <ConfirmationAction
                    size="sm"
                    onClick={() => onApproval(tool.approval!.id, true)}
                  >
                    允许一次
                  </ConfirmationAction>
                </>
              ) : (
                <>
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
                </>
              )}
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
  const input = tool.input as AskUserInput | undefined;
  const output = (tool.output ?? {}) as {
    answers?: Record<string, string | string[]>;
    skipped?: boolean;
    cancelled?: boolean;
  };
  const questions = input?.questions ?? [];
  if (output.cancelled || output.skipped) {
    return (
      <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-2xs text-muted-foreground">
        {output.cancelled ? "用户取消了问卷，按默认方案继续。" : "已跳过问卷，使用推荐项继续。"}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Check className="size-3.5 text-success" />
        需求已确认
      </div>
      {questions.length ? (
        <dl className="mt-2 space-y-2">
          {questions.map((question) => (
            <div key={question.id}>
              <dt className="text-3xs leading-4 text-muted-foreground">
                {question.label}
              </dt>
              <dd className="mt-0.5 text-xs leading-5 text-foreground/90">
                {answerText(question, output.answers?.[question.id])}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function answerText(
  question: AskUserInput["questions"][number],
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) {
    if (!value.length) return "未回答";
    return value
      .map(
        (item) =>
          question.options?.find((option) => option.value === item)?.label ?? item
      )
      .join("、");
  }
  if (!value) return "未回答";
  return question.options?.find((option) => option.value === value)?.label ?? value;
}

function ContinueCard({
  input,
  onContinue,
}: {
  input?: { summary?: string; completed?: string[]; remaining?: string[] };
  onContinue: (cont: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
      <p className="text-xs font-medium">本轮已经执行了较多步骤</p>
      <p className="mt-1 text-2xs leading-5 text-muted-foreground">
        达到单轮工具步数上限。可以继续执行剩余步骤，或先结束本轮查看当前结果。
      </p>
      {input?.summary ? (
        <p className="mt-2 text-2xs leading-5 text-foreground/90">
          {input.summary}
        </p>
      ) : null}
      {input?.remaining?.length ? (
        <p className="mt-1 text-3xs leading-5 text-muted-foreground">
          可能还剩：{input.remaining.join("、")}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" onClick={() => onContinue(true)}>
          继续执行
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onContinue(false)}
        >
          结束本轮
        </Button>
      </div>
    </div>
  );
}

function ContinueResult({ tool }: { tool: ToolUIPart }) {
  if (tool.state === "output-error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
        继续执行失败：{tool.errorText ?? "未知错误"}
      </div>
    );
  }
  const input = tool.input as
    | { summary?: string; completed?: string[]; remaining?: string[] }
    | undefined;
  const output = (tool.output ?? {}) as { continue?: boolean };
  const declined = output.continue === false;
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {declined ? (
          <X className="size-3.5 text-muted-foreground" />
        ) : (
          <Check className="size-3.5 text-success" />
        )}
        {declined ? "已结束本轮" : "已确认继续"}
      </div>
      {input?.summary ? (
        <p className="mt-1 text-2xs leading-5 text-foreground/90">
          {input.summary}
        </p>
      ) : null}
      {input?.remaining?.length ? (
        <p className="mt-1 text-3xs leading-5 text-muted-foreground">
          当时剩余：{input.remaining.join("、")}
        </p>
      ) : null}
    </div>
  );
}

function messageTimestamp(message: UIMessage): number | null {
  if (
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata)
  ) {
    const createdAt = (message.metadata as { createdAt?: unknown }).createdAt;
    if (typeof createdAt === "number") return createdAt;
  }
  const match = message.id.match(/^assistant_(\d+)_/);
  return match ? Number(match[1]) : null;
}

function formatMessageTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000)
  );
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `昨天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function TimeSeparator({ timestamp }: { timestamp: number | null }) {
  if (timestamp === null) return null;
  return (
    <div className="my-1 flex items-center gap-3 text-3xs text-muted-foreground">
      <span className="h-px flex-1 bg-border/60" />
      <time dateTime={new Date(timestamp).toISOString()}>
        {formatMessageTimestamp(timestamp)}
      </time>
      <span className="h-px flex-1 bg-border/60" />
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
  const input = tool.input as
    | { template?: "static" | "react-vite" | "fullstack-hono"; reason?: string }
    | undefined;
  const output = (tool.output ?? {}) as {
    cancelled?: boolean;
    prepared?: boolean;
  };
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {output.cancelled ? (
          <X className="size-3.5 text-muted-foreground" />
        ) : (
          <Check className="size-3.5 text-success" />
        )}
        {output.cancelled ? "已取消运行环境切换" : "已确认运行环境切换"}
      </div>
      {input?.template ? (
        <p className="mt-1 text-2xs text-muted-foreground">
          目标：{templateLabel(input.template)}
        </p>
      ) : null}
      {input?.reason ? (
        <p className="mt-0.5 text-2xs leading-5 text-foreground/90">
          {input.reason}
        </p>
      ) : null}
    </div>
  );
}
