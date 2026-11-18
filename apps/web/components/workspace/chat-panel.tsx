"use client";

import {
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquare,
  Paperclip,
  Play,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
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
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/workspace/panel";
import { planSteps } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

function StepIcon({ status }: { status: "done" | "active" | "todo" }) {
  if (status === "done") {
    return <CheckCircle2 className="size-3.5 text-success" />;
  }
  if (status === "active") {
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

export function ChatPanel({ className }: { className?: string }) {
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
            <Message from="user">
              <MessageContent>
                <MessageResponse>
                  做一个任务看板：可以新增、完成、删除任务，数据要保存下来，界面要好看。
                </MessageResponse>
              </MessageContent>
            </Message>

            <Message from="assistant">
              <MessageContent className="space-y-3">
                <Reasoning defaultOpen={false}>
                  <ReasoningTrigger />
                  <ReasoningContent>
                    需要先确认数据持久化方式。项目已有 SQLite，继续用它会比引入新依赖更稳。
                    界面沿用现有设计 token，避免出现第二套视觉语言。
                  </ReasoningContent>
                </Reasoning>

                <MessageResponse>
                  我先看一下现有结构，然后实现数据层和页面，最后跑一次构建。
                </MessageResponse>

                <div className="hidden sm:block">
                  <Task defaultOpen>
                    <TaskTrigger title={`执行计划 · 2/5`} />
                    <TaskContent>
                      {planSteps.map((step) => (
                        <TaskItem key={step.id} className="flex items-center gap-2 text-xs">
                          <StepIcon status={step.status} />
                          <span
                            className={cn(
                              step.status === "done" && "text-muted-foreground line-through",
                              step.status === "active" && "text-foreground",
                              step.status === "todo" && "text-muted-foreground"
                            )}
                          >
                            {step.title}
                          </span>
                        </TaskItem>
                      ))}
                    </TaskContent>
                  </Task>
                </div>

                <Tool defaultOpen={false}>
                  <ToolHeader type="tool-write_file" state="output-available" />
                  <ToolContent>
                    <ToolInput
                      input={{
                        path: "components/task-board.tsx",
                        bytes: 4210,
                      }}
                    />
                    <ToolOutput output="已写入 1 个文件" errorText={undefined} />
                  </ToolContent>
                </Tool>

                <Confirmation approval={{ id: "ap_01" }} state="approval-requested">
                  <ConfirmationTitle>需要确认</ConfirmationTitle>
                  <ConfirmationRequest>
                    即将执行 <code className="font-mono text-xs">pnpm add date-fns</code>
                    ，会修改 package.json 与 lockfile。
                  </ConfirmationRequest>
                  <ConfirmationActions>
                    <ConfirmationAction variant="outline" size="sm">
                      拒绝
                    </ConfirmationAction>
                    <ConfirmationAction size="sm">批准</ConfirmationAction>
                  </ConfirmationActions>
                </Confirmation>
              </MessageContent>
            </Message>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-3">
          <PromptInput
            onSubmit={() => {
              /* POC-08 接入 */
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea placeholder="描述你想做的应用，或粘贴需求…" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton aria-label="附件" variant="ghost" size="icon-sm">
                  <Paperclip className="size-3.5" />
                </PromptInputButton>
                <PromptInputButton aria-label="运行" variant="ghost" size="icon-sm">
                  <Play className="size-3.5" />
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit status="ready" />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </Panel>
  );
}
