"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Code2,
  FolderKanban,
  Gamepad2,
  GitBranch,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  SquareDashed,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProject,
  deleteProject,
  formatClock,
  renameProject,
  shortCommit,
  templateLabel,
  useProjects,
  type ProjectSummary,
  type TemplateChoice,
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

export function Dashboard() {
  const projects = useProjects();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("single");
  const [stack, setStack] = useState<TemplateChoice>("auto");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const list = projects.data ?? [];
  const versionTotal = list.reduce((sum, item) => sum + item.versionCount, 0);
  const lastSaved = list.reduce(
    (latest, item) => Math.max(latest, item.currentVersion?.createdAt ?? 0),
    0
  );

  const focusComposer = () => {
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    textareaRef.current?.focus();
  };

  const openRename = (project: ProjectSummary) => {
    setRenameValue(project.name);
    setRenameTarget(project);
    setDialogError(null);
  };

  const openDelete = (project: ProjectSummary) => {
    setDeleteTarget(project);
    setDialogError(null);
  };

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!renameTarget || !name || dialogBusy) return;

    setDialogBusy(true);
    setDialogError(null);
    try {
      await renameProject(renameTarget.id, name);
      setRenameTarget(null);
      projects.refresh();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setDialogBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget || dialogBusy) return;

    setDialogBusy(true);
    setDialogError(null);
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      projects.refresh();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setDialogBusy(false);
    }
  };

  const submit = async (text: string) => {
    const value = text.trim();
    if (!value || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const project = await createProject(value, stack);
      // 静态导出没有为动态项目 ID 预渲染 HTML，这里走整页加载
      window.location.assign(
        `/sessions/${encodeURIComponent(project.id)}?prompt=${encodeURIComponent(value)}`
      );
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
      setCreating(false);
    }
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
          {list.length > 0 ? (
            list.slice(0, 4).map((project) => (
              <a
                key={project.id}
                href={`/sessions/${encodeURIComponent(project.id)}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="truncate">{project.name}</span>
              </a>
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {projects.loading ? "加载中…" : "还没有项目"}
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
              <a
                href={
                  list[0]
                    ? `/sessions/${encodeURIComponent(list[0].id)}`
                    : "/sessions/demo"
                }
              >
                打开工作区
              </a>
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
              每个需求都会创建一个独立项目：自己的文件、预览、git 版本和会话。
              技术栈可以自动选型，也可以手动指定：Static、React 或全栈。
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
                  void submit(prompt);
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
              <Select
                value={stack}
                onValueChange={(value) => setStack(value as TemplateChoice)}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动选型</SelectItem>
                  <SelectItem value="static">Static</SelectItem>
                  <SelectItem value="react-vite">React</SelectItem>
                  <SelectItem value="fullstack-hono">全栈</SelectItem>
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
                disabled={!prompt.trim() || creating}
                onClick={() => void submit(prompt)}
              >
                {creating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <WandSparkles className="size-3.5" />
                )}
                {creating ? "创建中…" : "开始生成"}
              </Button>
            </div>
          </div>

          {createError ? (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
              创建项目失败：{createError}
            </p>
          ) : null}

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
              value={projects.loading ? "…" : `${list.length}`}
            />
            <StatCard
              icon={<GitBranch />}
              label="版本"
              value={projects.loading ? "…" : `${versionTotal}`}
            />
            <StatCard
              icon={<Clock3 />}
              label="最近保存"
              value={lastSaved > 0 ? formatClock(lastSaved) : "—"}
            />
            <StatCard
              icon={<Code2 />}
              label="沙箱"
              value="按需启动"
              dot="bg-success"
            />
          </div>

          <section id="projects" className="mt-10 scroll-mt-20">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  我的项目
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  每个项目有独立的容器与版本；点击卡片进入对应工作区。
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={focusComposer}>
                新建
                <ArrowRight className="size-3.5" />
              </Button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {list.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRename={openRename}
                  onDelete={openDelete}
                />
              ))}

              {list.length === 0 && !projects.loading ? (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
                  <FolderKanban className="size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    还没有项目，输入一个需求创建第一个。
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={focusComposer}
                className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center transition-colors hover:border-primary/50 hover:bg-card"
              >
                <span className="grid size-10 place-items-center rounded-full border border-border bg-card">
                  <Plus className="size-4 text-muted-foreground" />
                </span>
                <span className="text-sm font-medium">新建项目</span>
                <span className="max-w-56 text-2xs leading-5 text-muted-foreground">
                  描述一个网站，会创建一个独立项目并进入工作区
                </span>
              </button>
            </div>

            {projects.error ? (
              <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
                无法读取项目：{projects.error}
              </p>
            ) : null}
          </section>
        </main>
      </div>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !dialogBusy) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
            <DialogDescription>
              只修改项目名称，不影响文件、容器与版本历史。
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            maxLength={80}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRename();
              }
            }}
          />
          {dialogError ? (
            <p className="text-2xs text-destructive">{dialogError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={dialogBusy}
              onClick={() => setRenameTarget(null)}
            >
              取消
            </Button>
            <Button
              disabled={dialogBusy || !renameValue.trim()}
              onClick={() => void submitRename()}
              className="gap-1.5"
            >
              {dialogBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !dialogBusy) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              将删除「{deleteTarget?.name}」的工作区、容器和全部版本，操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          {dialogError ? (
            <p className="text-2xs text-destructive">{dialogError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={dialogBusy}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={dialogBusy}
              onClick={() => void submitDelete()}
              className="gap-1.5"
            >
              {dialogBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectSummary;
  onRename: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}) {
  const version = project.currentVersion;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
      <a href={`/sessions/${encodeURIComponent(project.id)}`} className="block">
        <div className="flex items-start gap-3 p-4 pr-10">
          <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-border bg-linear-to-br from-primary/20 via-card to-card">
            {/棋/.test(project.name) ? (
              <Gamepad2 className="size-6 text-primary" />
            ) : (
              <Code2 className="size-6 text-primary" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium">{project.name}</h3>
              <Badge
                variant="secondary"
                className="text-3xs"
                title={project.planReason || undefined}
              >
                {project.templateSource === "model" ? (
                  <Sparkles className="size-2.5" />
                ) : null}
                {templateLabel(project.template)}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {version?.summary || project.prompt}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3" />
                {version ? shortCommit(version.gitCommit) : "未生成"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" />
                {version ? formatClock(version.createdAt) : "刚创建"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Code2 className="size-3" />
                {project.versionCount} 个版本
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-2xs text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              version ? "bg-success" : "bg-warning"
            )}
          />
          {version
            ? `已保存版本 · ${project.id}`
            : `新项目 · 打开后发送第一条需求`}
        </div>
      </a>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-2 top-2 z-10"
            aria-label="项目操作"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(project)}>
            <Pencil className="size-3.5" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(project)}
          >
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
