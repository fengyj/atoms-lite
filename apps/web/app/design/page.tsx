"use client";

import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from "@/components/ai-elements/checkpoint";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
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
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/panel";
import { designTokens, planSteps } from "@/lib/fixtures";

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Box({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-3 ${className}`}>
      {children}
    </div>
  );
}

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">设计基座 · 组件 gallery</h1>
        <p className="text-xs text-muted-foreground">
          所有组件与状态都用假数据渲染，不依赖后端。POC-08 接真实数据时只替换数据源。
        </p>
      </header>

      <Section title="Tokens" note="组件里只允许使用语义类，禁止裸色值与任意值。">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {designTokens.map((token) => (
            <div key={token.name} className="overflow-hidden rounded-lg border border-border">
              <div className={`h-12 ${token.className}`} />
              <div className="space-y-0.5 bg-card px-2 py-1.5">
                <p className="font-mono text-2xs">{token.name}</p>
                <p className="text-3xs text-muted-foreground">{token.note}</p>
              </div>
            </div>
          ))}
        </div>
        <Box className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">圆角</span>
          <div className="size-8 rounded-sm border border-border" />
          <div className="size-8 rounded-md border border-border" />
          <div className="size-8 rounded-lg border border-border" />
          <div className="size-8 rounded-xl border border-border" />
          <span className="ml-4 text-xs text-muted-foreground">字号</span>
          <span className="text-lg font-semibold">标题 18</span>
          <span className="text-sm">正文 14</span>
          <span className="text-xs text-muted-foreground">辅助 12</span>
        </Box>
      </Section>

      <Section title="按钮与徽标">
        <Box className="flex flex-wrap items-center gap-2">
          <Button size="sm">主操作</Button>
          <Button size="sm" variant="secondary">次要</Button>
          <Button size="sm" variant="outline">描边</Button>
          <Button size="sm" variant="ghost">幽灵</Button>
          <Button size="sm" variant="destructive">危险</Button>
          <Button size="sm" disabled>禁用</Button>
          <Badge>默认</Badge>
          <Badge variant="secondary">次级</Badge>
          <Badge variant="outline">描边</Badge>
          <Badge variant="destructive">失败</Badge>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> 就绪
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-warning" /> 等待确认
          </span>
        </Box>
      </Section>

      <Section title="消息" note="普通文本 / Markdown / 代码 / 长内容">
        <div className="space-y-3">
          <Box>
            <Message from="user">
              <MessageContent>
                <MessageResponse>做一个任务看板，数据要保存。</MessageResponse>
              </MessageContent>
            </Message>
          </Box>
          <Box>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{`我已经完成数据层，接下来处理页面。

- 数据表：\`tasks(id, title, done)\`
- 接口：\`GET /api/tasks\`、\`POST /api/tasks\`

| 能力 | 状态 |
| --- | --- |
| 新增 | 完成 |
| 删除 | 完成 |`}</MessageResponse>
              </MessageContent>
            </Message>
          </Box>
          <Box>
            <CodeBlock
              language="tsx"
              code={`export function TaskItem({ task }: { task: Task }) {
  return <li className="flex items-center gap-2">{task.title}</li>;
}`}
            />
          </Box>
        </div>
      </Section>

      <Section title="工具调用" note="四态：等待参数 / 执行中 / 成功 / 失败">
        <div className="grid gap-3 md:grid-cols-2">
          <Box>
            <Tool defaultOpen>
              <ToolHeader type="tool-write_file" state="input-streaming" />
              <ToolContent>
                <div className="p-4 text-xs text-muted-foreground">正在生成参数…</div>
              </ToolContent>
            </Tool>
          </Box>
          <Box>
            <Tool defaultOpen>
              <ToolHeader type="tool-exec" state="input-available" />
              <ToolContent>
                <ToolInput input={{ program: "pnpm", args: ["install"] }} />
              </ToolContent>
            </Tool>
          </Box>
          <Box>
            <Tool defaultOpen>
              <ToolHeader type="tool-write_file" state="output-available" />
              <ToolContent>
                <ToolInput input={{ path: "app/page.tsx", bytes: 1820 }} />
                <ToolOutput output="已写入 app/page.tsx" errorText={undefined} />
              </ToolContent>
            </Tool>
          </Box>
          <Box>
            <Tool defaultOpen>
              <ToolHeader type="tool-exec" state="output-error" />
              <ToolContent>
                <ToolInput input={{ program: "pnpm", args: ["build"] }} />
                <ToolOutput
                  output={undefined}
                  errorText={"Error: Cannot find module '@/lib/db'"}
                />
              </ToolContent>
            </Tool>
          </Box>
        </div>
      </Section>

      <Section title="推理与计划">
        <div className="grid gap-3 md:grid-cols-2">
          <Box>
            <Reasoning defaultOpen>
              <ReasoningTrigger />
              <ReasoningContent>
                先确认数据持久化方式，再决定是否需要迁移。现有 SQLite 足够，不引入新依赖。
              </ReasoningContent>
            </Reasoning>
          </Box>
          <Box>
            <Plan defaultOpen>
              <PlanHeader>
                <PlanTitle>实现任务看板</PlanTitle>
                <PlanDescription>5 步 · 预计 2 分钟</PlanDescription>
                <PlanAction>
                  <PlanTrigger />
                </PlanAction>
              </PlanHeader>
              <PlanContent>
                <ol className="space-y-1.5 text-xs">
                  {planSteps.map((step, i) => (
                    <li key={step.id} className="flex gap-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span
                        className={
                          step.status === "done" ? "text-muted-foreground line-through" : ""
                        }
                      >
                        {step.title}
                      </span>
                    </li>
                  ))}
                </ol>
              </PlanContent>
            </Plan>
          </Box>
        </div>
      </Section>

      <Section title="任务清单">
        <Box>
          <Task defaultOpen>
            <TaskTrigger title="执行计划 · 2/5" />
            <TaskContent>
              {planSteps.map((step) => (
                <TaskItem key={step.id} className="text-xs">
                  {step.status === "done" ? "✓ " : step.status === "active" ? "◐ " : "○ "}
                  {step.title}
                </TaskItem>
              ))}
            </TaskContent>
          </Task>
        </Box>
      </Section>

      <Section title="审批" note="待确认 / 已批准 / 已拒绝">
        <div className="grid gap-3 lg:grid-cols-3">
          <Box>
            <Confirmation approval={{ id: "ap_1" }} state="approval-requested">
              <ConfirmationTitle>需要确认</ConfirmationTitle>
              <ConfirmationRequest>即将安装依赖 date-fns。</ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction variant="outline" size="sm">拒绝</ConfirmationAction>
                <ConfirmationAction size="sm">批准</ConfirmationAction>
              </ConfirmationActions>
            </Confirmation>
          </Box>
          <Box>
            <Confirmation approval={{ id: "ap_2", approved: true }} state="approval-responded">
              <ConfirmationTitle>已批准</ConfirmationTitle>
              <ConfirmationAccepted>用户批准了该操作。</ConfirmationAccepted>
            </Confirmation>
          </Box>
          <Box>
            <Confirmation
              approval={{ id: "ap_3", approved: false, reason: "不要引入新依赖" }}
              state="output-denied"
            >
              <ConfirmationTitle>已拒绝</ConfirmationTitle>
              <ConfirmationRejected>用户拒绝：不要引入新依赖。</ConfirmationRejected>
            </Confirmation>
          </Box>
        </div>
      </Section>

      <Section title="产物与版本">
        <div className="grid gap-3 md:grid-cols-2">
          <Box className="p-0">
            <Artifact>
              <ArtifactHeader>
                <div>
                  <ArtifactTitle>version-v3.zip</ArtifactTitle>
                  <ArtifactDescription>184 KB · 12:41</ArtifactDescription>
                </div>
              </ArtifactHeader>
              <ArtifactContent>
                <p className="text-xs text-muted-foreground">
                  包含源码、迁移脚本与 README。
                </p>
              </ArtifactContent>
            </Artifact>
          </Box>
          <Box className="space-y-2">
            <Checkpoint>
              <CheckpointIcon />
              <CheckpointTrigger tooltip="回到这个版本">v3 · 12:41 · 已验证</CheckpointTrigger>
            </Checkpoint>
            <Checkpoint>
              <CheckpointIcon />
              <CheckpointTrigger tooltip="回到这个版本">v2 · 12:18 · 已验证</CheckpointTrigger>
            </Checkpoint>
          </Box>
        </div>
      </Section>

      <Section title="预览与终端">
        <div className="grid gap-3 lg:grid-cols-2">
          <Box className="h-64 p-0">
            <WebPreview defaultUrl="/demo-preview.html" className="size-full rounded-none border-0">
              <WebPreviewNavigation>
                <WebPreviewUrl className="h-7 font-mono text-2xs" />
              </WebPreviewNavigation>
              <WebPreviewBody src="/demo-preview.html" />
            </WebPreview>
          </Box>
          <Box className="p-0">
            <pre className="h-64 overflow-auto p-3 font-mono text-2xs leading-5">
              <div className="text-foreground">$ pnpm build</div>
              <div className="text-muted-foreground">Creating an optimized build…</div>
              <div className="text-success">✓ Compiled successfully in 3.2s</div>
              <div className="text-muted-foreground">○ / 4.1 kB</div>
              <div className="text-foreground">$ pnpm start --port 3000</div>
              <div className="text-success">✓ ready on http://0.0.0.0:3000</div>
              <div className="text-warning">⚠ image optimization disabled</div>
            </pre>
          </Box>
        </div>
      </Section>

      <Section title="面板状态" note="空 / 加载 / 错误">
        <div className="grid gap-3 md:grid-cols-3">
          <Box className="h-40 p-0">
            <EmptyState title="还没有产物" hint="生成并保存一个版本后，产物会出现在这里。" />
          </Box>
          <Box className="flex h-40 items-center justify-center p-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader size={14} />
              正在启动预览…
            </div>
          </Box>
          <Box className="h-40 p-0">
            <EmptyState
              title="构建失败"
              hint="Cannot find module '@/lib/db'"
              action={
                <Button size="sm" variant="outline" className="mt-1">
                  查看日志
                </Button>
              }
            />
          </Box>
        </div>
      </Section>

      <Section title="输入区" note="空闲 / 运行中">
        <div className="space-y-3">
          <Box>
            <PromptInput onSubmit={() => {}}>
              <PromptInputBody>
                <PromptInputTextarea placeholder="描述你想做的应用…" />
              </PromptInputBody>
              <PromptInputFooter>
                <span className="text-2xs text-muted-foreground">⏎ 发送 · ⇧⏎ 换行</span>
                <PromptInputSubmit status="ready" />
              </PromptInputFooter>
            </PromptInput>
          </Box>
          <Box>
            <PromptInput onSubmit={() => {}}>
              <PromptInputBody>
                <PromptInputTextarea placeholder="继续补充需求…" />
              </PromptInputBody>
              <PromptInputFooter>
                <span className="text-2xs text-muted-foreground">运行中，可随时停止</span>
                <PromptInputSubmit status="streaming" />
              </PromptInputFooter>
            </PromptInput>
          </Box>
        </div>
      </Section>
    </main>
  );
}
