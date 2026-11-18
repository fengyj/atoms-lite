"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  Code2,
  FolderKanban,
  Gamepad2,
  GitBranch,
  LayoutGrid,
  Loader2,
  Paperclip,
  Plus,
  Settings,
  Sparkles,
  SquareDashed,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchPreviewStatus,
  formatClock,
  shortCommit,
  useWorkspaceFiles,
  useWorkspaceVersions,
  type PreviewStatus,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  {
    title: "五子棋对战",
    prompt: "做一个五子棋：双人对战、自动判断胜负、支持重新开局，界面简洁好看。",
  },
  {
    title: "待办清单",
    prompt: "做一个待办清单网页：可以新增、完成、删除任务，支持本地保存和筛选。",
  },
  {
    title: "作品集主页",
    prompt: "做一个个人作品集主页：包含简介、项目列表和联系方式，深色主题、响应式。",
  },
];

const SESSION_PATH = "/sessions/demo";

export function Dashboard() {
  const router = useRouter();
  const versions = useWorkspaceVersions();
  const files = useWorkspaceFiles();
  const [preview, setPreview] = useState<PreviewStatus | null>(null);

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("single");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    fetchPreviewStatus()
      .then((next) => {
        if (alive) setPreview(next);
      })
      .catch(() => {
        if (alive) setPreview({ running: false, ready: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  const currentVersion =
    versions.data?.find((v) => v.current) ?? versions.data?.at(-1) ?? null;
  const versionCount = versions.data?.length ?? 0;
  const projectCount = versionCount > 0 ? 1 : 0;

  const focusComposer = () => {
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    textareaRef.current?.focus();
  };

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    router.push(`${SESSION_PATH}?prompt=${encodeURIComponent(value)}`);
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <Link
          href="/"
          className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">atoms-lite</span>
          <Badge variant="outline" className="ml-auto text-3xs">
            v1
          </Badge>
        </Link>

        <nav className="space-y-1 p-2">
          <SidebarItem icon={<LayoutGrid />} label="工作台" active />
          <a href="#projects" className="block">
            <SidebarItem icon={<FolderKanban />} label="我的项目" />
          </a>
          <SidebarItem icon={<SquareDashed />} label="模板" disabled />
          <SidebarItem icon={<Settings />} label="设置" disabled />
        </nav>

        <div className="mt-4 px-4 text-3xs font-medium tracking-widest text-muted-foreground uppercase">
          最近项目
        </div>
        <div className="mt-1 space-y-0.5 px-2">
          {versionCount > 0 ? (
            <Link
              href={SESSION_PATH}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate">五子棋 Demo</span>
            </Link>
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              还没有项目
            </p>
          )}
        </div>

        <div className="mt-auto border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5 py-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-2xs font-medium text-primary">
              YF
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">演示用户</p>
              <p className="truncate text-3xs text-muted-foreground">
                单角色模式
              </p>
            </div>
            <Badge variant="secondary" className="text-3xs">
              Demo
            </Badge>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">atoms-lite</span>
          </Link>
          <span className="hidden text-sm font-medium lg:inline">工作台</span>
          <Badge variant="outline" className="hidden font-normal sm:inline-flex">
            单角色
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={SESSION_PATH}>打开工作区</Link>
            </Button>
            <Button size="sm" onClick={focusComposer} className="gap-1.5">
              <Plus className="size-3.5" />
              新建应用
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 lg:px-8 lg:py-12">
          <div className="max-w-2xl">
            <p className="text-2xs font-medium tracking-widest text-primary uppercase">
              Build with words
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              把一个想法变成可运行的应用
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              描述你要的网站，Agent 会在隔离沙箱里写代码、启动预览并保存版本。
              当前支持单角色与多文件静态站点。
            </p>
          </div>

          <div className="mt-7 rounded-xl border border-border bg-card p-3 shadow-sm">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submit(prompt);
                }
              }}
              placeholder="例如：做一个五子棋游戏网站，支持双人对战、胜负判定和重新开始"
              className="min-h-28 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-1 pt-2.5">
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">单角色</SelectItem>
                  <SelectItem value="auto">自动</SelectItem>
                  <SelectItem value="multi" disabled>
                    多角色（即将支持）
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                disabled
                className="gap-1.5"
                title="附件功能即将开放"
              >
                <Paperclip className="size-3.5" />
                附件
              </Button>
              <span className="ml-auto hidden text-2xs text-muted-foreground sm:inline">
                ⌘ / Ctrl + Enter 发送
              </span>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!prompt.trim()}
                onClick={() => submit(prompt)}
              >
                <WandSparkles className="size-3.5" />
                开始生成
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xs text-muted-foreground">试试：</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.title}
                type="button"
                onClick={() => {
                  setPrompt(example.prompt);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border border-border bg-card px-3 py-1 text-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {example.title}
              </button>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<FolderKanban />}
              label="项目"
              value={projectCount > 0 ? `${projectCount}` : "0"}
            />
            <StatCard
              icon={<GitBranch />}
              label="版本"
              value={versionCount > 0 ? `${versionCount}` : "—"}
            />
            <StatCard
              icon={<Clock3 />}
              label="最近保存"
              value={
                currentVersion ? formatClock(currentVersion.createdAt) : "—"
              }
            />
            <StatCard
              icon={<Code2 />}
              label="沙箱"
              value={
                preview === null
                  ? "检测中"
                  : preview.ready
                    ? "运行中"
                    : preview.running
                      ? "启动中"
                      : "已休眠"
              }
              dot={
                preview === null
                  ? "bg-warning animate-pulse"
                  : preview.ready
                    ? "bg-success"
                    : preview.running
                      ? "bg-warning animate-pulse"
                      : "bg-muted-foreground"
              }
            />
          </div>

          <section id="projects" className="mt-10 scroll-mt-20">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  我的项目
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  v1 只保留一个演示项目；新的需求会继续修改当前工作区。
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={focusComposer}>
                新建
                <ArrowRight className="size-3.5" />
              </Button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {versionCount > 0 && currentVersion ? (
                <Link
                  href={SESSION_PATH}
                  className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
                >
                  <div className="flex items-start gap-3 p-4">
                    <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-border bg-linear-to-br from-primary/20 via-card to-card">
                      <Gamepad2 className="size-6 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium">
                          五子棋 Demo
                        </h3>
                        <Badge variant="secondary" className="text-3xs">
                          Web
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {currentVersion.summary}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="size-3" />
                          {shortCommit(currentVersion.gitCommit)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" />
                          {formatClock(currentVersion.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Code2 className="size-3" />
                          {files.data?.length ?? 0} 个文件
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                  <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-2xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-success" />
                    已保存版本 · 可继续对话修改
                  </div>
                </Link>
              ) : (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {versions.loading ? "正在读取项目…" : "还没有项目"}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={focusComposer}
                className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center transition-colors hover:border-primary/50 hover:bg-card"
              >
                <span className="grid size-10 place-items-center rounded-full border border-border bg-card">
                  <Plus className="size-4 text-muted-foreground" />
                </span>
                <span className="text-sm font-medium">从新需求开始</span>
                <span className="max-w-56 text-2xs leading-5 text-muted-foreground">
                  描述一个网站，Agent 会直接在当前演示项目中实现
                </span>
              </button>
            </div>
          </section>

          {versions.error ? (
            <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
              无法读取工作区：{versions.error}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors [&_svg]:size-3.5",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      {icon}
      {label}
      {disabled ? (
        <span className="ml-auto text-3xs text-muted-foreground">待开放</span>
      ) : null}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  dot,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dot?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground [&_svg]:size-3">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {dot ? <span className={cn("size-1.5 rounded-full", dot)} /> : null}
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}
