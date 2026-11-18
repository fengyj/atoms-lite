"use client";

import type { ChatStatus, ToolUIPart, UIMessage } from "ai";
import { MessageSquare, Sparkles } from "lucide-react";
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
import { Panel } from "@/components/workspace/panel";

/** 空态示例需求：五子棋 */
const SAMPLE_PROMPT =
  "做一个五子棋：双人对战、自动判断胜负、支持重新开局，界面简洁好看。";

export function ChatPanel({
  className,
  messages,
  status,
  busy,
  onSubmitText,
  onStop,
  onApproval,
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
}) {
  const handleSubmit = ({ text }: { text: string }) => {
    const trimmed = text.trim();
    if (busy) {
      // 运行中提交 = 停止当前回合
      onStop();
      return;
    }
    if (trimmed) onSubmitText(trimmed);
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
          <ConversationContent className="gap-5 px-3 py-4">
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
                  onClick={() => onSubmitText(SAMPLE_PROMPT)}
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
                    renderPart(part, index, onApproval)
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-3">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="描述你想做的应用，或粘贴需求…" />
            </PromptInputBody>
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={busy ? "streaming" : status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </Panel>
  );
}

/** 单个消息 part 的渲染：text / reasoning / tool-* */
function renderPart(
  part: UIMessage["parts"][number],
  index: number,
  onApproval: (id: string, approved: boolean) => void
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

  if (part.type.startsWith("tool-")) {
    const tool = part as ToolUIPart;
    return (
      <div key={index} data-tool={tool.type} data-state={tool.state}>
        <Tool defaultOpen>
          <ToolHeader type={tool.type} state={tool.state} />
          <ToolContent>
            {tool.input !== undefined ? <ToolInput input={tool.input} /> : null}
            <ToolOutput output={tool.output} errorText={tool.errorText} />
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
