"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FolderKanban,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { FeaturedArt, ProjectArt } from "@/components/dashboard/project-art";
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
  createProject,
  deleteProject,
  renameProject,
  shortCommit,
  templateLabel,
  useProjects,
  useUsageStatus,
  type ProjectSummary,
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

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "$—";
  if (value === 0) return "$0";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`;
}

function markTone(project: ProjectSummary): string {
  if (project.template === "fullstack-hono") return "bg-brand-soft text-brand";
  if (project.template === "react-vite") return "bg-secondary text-success";
  return "bg-secondary text-warning";
}

function projectMark(name: string): string {
  if (/记账|账单|收支/.test(name)) return "记";
  if (/费用|统计|报表/.test(name)) return "费";
  if (/2048/i.test(name)) return "20";
  if (/五子棋|棋盘|棋/.test(name)) return "棋";
  if (/打印|3D/i.test(name)) return "3D";
  if (/番茄|计时|倒计时/.test(name)) return "番";
  if (/待办|任务|清单/.test(name)) return "待";
  if (/计算器/.test(name)) return "算";
  if (/周报|日报|月报/.test(name)) return "报";
  if (/简历|作品集|个人/.test(name)) return "简";
  return name.slice(0, 1);
}

function ProjectMark({
  project,
  className,
}: {
  project: ProjectSummary;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center font-serif font-medium",
        markTone(project),
        className
      )}
    >
      {projectMark(project.name)}
    </span>
  );
}

export function Dashboard() {
  const projects = useProjects();
  const usage = useUsageStatus();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const list = projects.data ?? [];
  const featured = list.find((project) => project.published) ?? list[0] ?? null;
  const rest = list.filter((project) => project.id !== featured?.id);
  const totalVersions = list.reduce(
    (sum, project) => sum + project.versionCount,
    0
  );
  const publishedCount = list.filter((project) => project.published).length;

  const costLimit = usage.data?.costLimitUsd ?? 1;

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
      const project = await createProject(value);
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
    <div className="min-h-dvh bg-background">
      <div className="h-1 bg-brand" />

      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-[1320px] items-center gap-6 px-6 py-4">
          <Link href="/" className="flex items-baseline gap-2.5">
            <span className="grid size-7 place-items-center rounded-full bg-foreground text-background">
              <BrandMark className="size-3.5" />
            </span>
            <span className="font-serif text-xl font-medium tracking-tight">
              atoms
            </span>
            <span className="hidden text-3xs tracking-[0.16em] text-muted-foreground uppercase sm:inline">
              lite · studio
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a
              href="/"
              className="border-b border-foreground pb-0.5 text-foreground"
            >
              工作台
            </a>
            <a href="#projects" className="hover:text-foreground">
              项目
            </a>
            <span className="cursor-not-allowed">模板</span>
            <span className="cursor-not-allowed">设置</span>
          </nav>

          <span className="ml-auto hidden text-3xs tracking-[0.12em] text-muted-foreground uppercase lg:inline">
            Issue 04 · 2026
          </span>

          <div className="flex items-center gap-2">
            <span className="hidden text-2xs text-muted-foreground xl:inline">
              {list.length} 个项目 · {publishedCount} 个已发布
            </span>
            <Button variant="ghost" size="sm" className="hidden gap-1.5 sm:inline-flex" asChild>
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
            <Button
              size="sm"
              onClick={focusComposer}
              className="gap-1.5 rounded-full"
            >
              <Plus className="size-3.5" />
              新建应用
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-6 py-10 lg:py-12">
        <section className="relative grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div className="pointer-events-none absolute -top-28 -left-24 size-[440px] rounded-full bg-brand/5 blur-3xl" />
          <div className="relative">
            <h1 className="text-balance font-serif text-5xl leading-[0.98] font-medium tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              把一个想法
              <br />
              <span className="text-brand">变成可运行的</span>
              <br />
              应用。
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
              每个需求都是一个独立项目：自己的文件、预览、历史和发布地址。
              不用选技术栈，直接描述你想做什么。
            </p>
          </div>

          <div className="relative">
            <div className="flex items-center justify-between border-t border-foreground/80 pt-3">
              <label
                htmlFor="prompt"
                className="text-3xs tracking-[0.16em] text-muted-foreground uppercase"
              >
                新的请求
              </label>
              <span className="text-3xs text-muted-foreground">
                ⌘ / Ctrl + Enter
              </span>
            </div>
            <div className="panel-surface mt-3 border border-border bg-card p-3">
              <Textarea
                id="prompt"
                ref={textareaRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void submit(prompt);
                  }
                }}
                placeholder="比如：做一个个人记账本，支持分类、月度统计和深色模式……"
                className="min-h-36 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border px-1 pt-3">
                <span className="text-2xs text-muted-foreground">
                  自动选择模板 · 不需要手动选技术栈
                </span>
                <Button
                  size="sm"
                  className="ml-auto gap-1.5 rounded-full"
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

            {createError ? (
              <p className="mt-3 border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
                创建项目失败：{createError}
              </p>
            ) : null}
          </div>
        </section>

        <section id="projects" className="mt-10 scroll-mt-20">
          <div className="flex items-end justify-between border-b border-foreground/80 pb-3">
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              <span className="text-brand">01—</span> 最近项目
            </h2>
            <button
              type="button"
              onClick={focusComposer}
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
            >
              新建
              <ArrowRight className="size-3" />
            </button>
          </div>

          {featured ? (
            <FeaturedProject
              project={featured}
              onRename={openRename}
              onDelete={openDelete}
            />
          ) : null}

          {projects.loading && list.length === 0 ? (
            <div className="mt-4 h-64 animate-pulse border border-border bg-card/60" />
          ) : null}

          {list.length === 0 && !projects.loading ? (
            <div className="mt-4 flex min-h-56 flex-col items-center justify-center gap-3 border border-dashed border-border bg-card/50 p-8 text-center">
              <FolderKanban className="size-6 text-muted-foreground" />
              <p className="font-serif text-lg">还没有项目</p>
              <p className="max-w-sm text-xs leading-6 text-muted-foreground">
                在上面的输入框里描述一个需求，创建你的第一个项目。
              </p>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={focusComposer}
              >
                开始创建
              </Button>
            </div>
          ) : null}

          <section className="mt-6 grid border-t border-b border-border sm:grid-cols-3">
            <Stat
              label="Projects"
              value={String(list.length).padStart(2, "0")}
              sub={`${publishedCount} 个已发布`}
            />
            <Stat
              label="Versions"
              value={String(totalVersions).padStart(2, "0")}
              sub="全部项目累计"
            />
            <Stat
              label="Today"
              value={usage.error ? "$—" : formatUsd(usage.data?.costUsd ?? 0)}
              sub={usage.error ? "用量暂不可用" : `of ${formatUsd(costLimit)}`}
            />
          </section>

          <div className="mt-10 flex items-end justify-between border-b border-foreground/80 pb-3">
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              <span className="text-brand">02—</span> 更多项目
            </h2>
            <button
              type="button"
              onClick={focusComposer}
              className="text-2xs text-muted-foreground hover:text-foreground"
            >
              全部项目 →
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {rest.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index + 2}
                onRename={openRename}
                onDelete={openDelete}
              />
            ))}
          </div>

          {rest.length === 0 && list.length > 0 ? (
            <p className="mt-4 border border-dashed border-border bg-card/50 px-4 py-6 text-center text-xs text-muted-foreground">
              暂时没有更多项目。
            </p>
          ) : null}

          {projects.error ? (
            <p className="mt-5 border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
              无法读取项目：{projects.error}
            </p>
          ) : null}

          <section className="mt-10 grid gap-6 border-t border-border pt-6 lg:grid-cols-[1.3fr_0.7fr]">
            <blockquote className="font-serif text-2xl leading-snug text-foreground/80 italic">
              “先让它跑起来，再让它变好。每一次版本，都是一次更接近真实使用的机会。”
            </blockquote>
            <p className="text-xs leading-6 text-muted-foreground">
              Editorial Feature 把首页当成一期杂志：一个主推项目、一组近期项目、
              一个清晰的入口。项目仍然保留真实的版本、发布状态和用量。
            </p>
          </section>
        </section>
      </main>

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

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <div className="text-3xs tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl tracking-[-0.04em]">
        {value}{" "}
        <span className="font-sans text-2xs tracking-normal text-muted-foreground">
          {sub}
        </span>
      </div>
    </div>
  );
}

function ProjectMenu({
  project,
  onRename,
  onDelete,
  className,
}: {
  project: ProjectSummary;
  onRename: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("z-10", className)}
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
  );
}

function FeaturedProject({
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
    <article className="panel-surface relative mt-4 grid border border-border bg-card lg:grid-cols-[0.9fr_1.1fr]">
      <div className="relative min-h-60 overflow-hidden border-b border-border bg-brand-soft lg:border-r lg:border-b-0">
        <span className="absolute top-4 left-5 text-3xs tracking-[0.16em] text-brand/70 uppercase">
          Featured project
        </span>
        <FeaturedArt className="pointer-events-none text-brand/45" />
        <ProjectMark
          project={project}
          className="absolute bottom-5 left-5 size-20 rounded-full border border-brand/20 text-3xl"
        />
      </div>

      <div className="flex min-w-0 flex-col justify-center p-6 lg:p-8">
        <h3 className="font-serif text-3xl leading-tight font-medium tracking-tight">
          {project.name}
        </h3>
        <p className="mt-3 line-clamp-3 max-w-xl text-xs leading-6 text-muted-foreground">
          {version?.summary || project.prompt}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          {project.published ? (
            <Badge
              variant="outline"
              className="border-success/40 bg-success/10 text-success"
            >
              <Rocket className="size-2.5" />
              已发布
            </Badge>
          ) : (
            <Badge variant="outline">草稿</Badge>
          )}
          <span>{templateLabel(project.template)}</span>
          <span>{project.versionCount} 个版本</span>
          {version ? (
            <span className="font-mono">{shortCommit(version.gitCommit)}</span>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full" asChild>
            <a href={`/sessions/${encodeURIComponent(project.id)}`}>打开项目</a>
          </Button>
          {project.deploymentUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              asChild
            >
              <a
                href={project.deploymentUrl}
                target="_blank"
                rel="noreferrer"
              >
                访问站点 ↗
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <ProjectMenu
        project={project}
        onRename={onRename}
        onDelete={onDelete}
        className="absolute top-2 right-2"
      />
    </article>
  );
}

function ProjectCard({
  project,
  index,
  onRename,
  onDelete,
}: {
  project: ProjectSummary;
  index: number;
  onRename: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}) {
  const version = project.currentVersion;
  const artTone =
    project.template === "fullstack-hono"
      ? "bg-brand-soft"
      : project.template === "react-vite"
        ? "bg-success/10"
        : "bg-warning/10";
  const artColor =
    project.template === "fullstack-hono"
      ? "text-brand/50"
      : project.template === "react-vite"
        ? "text-success/40"
        : "text-warning/50";

  return (
    <article className="group panel-surface relative h-full overflow-hidden border border-border bg-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <a
        href={`/sessions/${encodeURIComponent(project.id)}`}
        className="flex h-full flex-col"
      >
        <div
          className={cn(
            "relative h-28 shrink-0 overflow-hidden border-b border-border",
            artTone
          )}
        >
          <span className="absolute top-3 left-4 z-10 font-serif text-2xs text-foreground/40">
            {String(index).padStart(2, "0")}
          </span>
          <ProjectArt
            variant={index % 10}
            className={cn("pointer-events-none", artColor)}
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex min-w-0 items-center gap-3">
            <ProjectMark
              project={project}
              className="size-8 rounded-md text-xs"
            />
            <h3 className="truncate font-serif text-xl font-medium tracking-tight">
              {project.name}
            </h3>
            {project.published ? (
              <Badge
                variant="outline"
                className="ml-auto shrink-0 border-success/40 bg-success/10 text-3xs text-success"
              >
                <Rocket className="size-2.5" />
                已发布
              </Badge>
            ) : null}
          </div>
          <p className="mt-3 line-clamp-2 text-xs leading-6 text-muted-foreground">
            {version?.summary || project.prompt}
          </p>
          <div className="mt-auto flex items-center gap-2 pt-4 text-2xs text-muted-foreground">
            <span>{templateLabel(project.template)}</span>
            <span aria-hidden="true">·</span>
            <span>{project.versionCount} 个版本</span>
            {version ? (
              <span className="ml-auto font-mono text-3xs">
                {shortCommit(version.gitCommit)}
              </span>
            ) : null}
          </div>
        </div>
      </a>

      <ProjectMenu
        project={project}
        onRename={onRename}
        onDelete={onDelete}
        className="absolute top-2 right-2"
      />
    </article>
  );
}
