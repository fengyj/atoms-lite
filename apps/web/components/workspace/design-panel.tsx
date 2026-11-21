"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  designPreviewUrl,
  selectWorkspaceDesign,
  type Endpoint,
  type WorkspaceDesign,
  type WorkspaceDesignListing,
  type WorkspaceRequirements,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

function designStatusLabel(status: string): string {
  if (status === "applied") return "已应用";
  if (status === "selected") return "已选择";
  if (status === "review") return "待选择";
  return "草稿";
}

function designStatusTone(status: string): string {
  if (status === "applied" || status === "selected")
    return "border-success/40 bg-success/10 text-success";
  if (status === "review")
    return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-muted/40 text-muted-foreground";
}

export function DesignPanel({
  projectId,
  designs,
  requirements,
  busy,
  onContinue,
}: {
  projectId: string;
  designs: Endpoint<WorkspaceDesignListing>;
  requirements: Endpoint<WorkspaceRequirements | null>;
  busy: boolean;
  onContinue: (text: string) => void;
}) {
  const list = designs.data?.designs ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const preferred = designs.data?.selectedId;
    if (preferred && preferred !== selectedId) setSelectedId(preferred);
    // 只在服务端选中的方向变化时跟随，避免覆盖用户手动浏览
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs.data?.selectedId]);

  useEffect(() => {
    if (selectedId && list.some((design) => design.id === selectedId)) return;
    const preferred =
      designs.data?.selectedId ??
      list.find((design) => design.status === "selected")?.id ??
      list[0]?.id ??
      null;
    if (preferred) setSelectedId(preferred);
  }, [designs.data?.selectedId, list, selectedId]);

  useEffect(() => {
    if (!busy) return;
    // 概念是逐个落库的；Agent 忙碌时轻量轮询，让先完成的方向先出现。
    const timer = window.setInterval(() => designs.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [busy, designs.refresh]);

  const selected =
    list.find((design) => design.id === selectedId) ?? list[0] ?? null;
  const requirementsConfirmed =
    designs.data?.requirementsStatus === "confirmed" ||
    requirements.data?.status === "confirmed";

  const generate = (mode: "new" | "revision") => {
    setError(null);
    onContinue(
      mode === "revision"
        ? "请基于当前需求摘要和已有设计，再生成 3 个结构不同的设计方向，放到设计 tab 里让我比较。"
        : "请根据已确认的需求摘要生成 3 个结构不同的设计方向。",
    );
  };

  const select = async (design: WorkspaceDesign) => {
    if (busy || selecting) return;
    setSelecting(true);
    setError(null);
    try {
      await selectWorkspaceDesign(projectId, design.id, notes.trim() || undefined);
      designs.refresh();
      await requirements.refresh();
      onContinue(
        `我选择了设计方向「${design.title}」（designId: ${design.id}）。请先 apply_design，然后按 DESIGN.md 开始实现。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelecting(false);
    }
  };

  const refine = () => {
    if (!selected || !notes.trim() || busy) return;
    onContinue(
      `请微调设计方向「${selected.title}」（designId: ${selected.id}）：${notes.trim()}`,
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Palette className="size-3.5 text-muted-foreground" />
        <h2 className="font-serif text-base font-medium">设计方向</h2>
        {designs.data ? (
          <Badge
            variant="outline"
            className={cn(
              "text-3xs",
              designStatusTone(designs.data.status),
            )}
          >
            {designStatusLabel(designs.data.status)}
          </Badge>
        ) : null}
        <span className="text-2xs text-muted-foreground">
          {list.length ? `${list.length} 个方向` : "还没有设计稿"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy || !requirementsConfirmed}
            onClick={() => generate(list.length ? "revision" : "new")}
          >
            {list.length ? (
              <RefreshCw className="size-3.5" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {list.length ? "再生成 3 个" : "生成 3 个方向"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mx-4 mt-3 border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
          {error}
        </p>
      ) : null}

      {requirements.data ? (
        <div className="mx-4 mt-3 border border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-3xs tracking-[0.14em] text-muted-foreground uppercase">
              需求摘要
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-3xs",
                requirements.data.status === "confirmed"
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/10 text-warning",
              )}
            >
              {requirements.data.status === "confirmed" ? "已确认" : "待确认"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-6 text-foreground">
            {requirements.data.brief.summary}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            {requirements.data.brief.audience} · {requirements.data.brief.job}
          </p>
        </div>
      ) : (
        <p className="mx-4 mt-3 border border-dashed border-border px-4 py-3 text-2xs text-muted-foreground">
          还没有需求摘要。先在对话里让 Agent 了解需求并确认。
        </p>
      )}

      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full border border-border bg-muted/30 text-muted-foreground">
            <Palette className="size-5" />
          </span>
          <p className="font-serif text-lg">还没有设计方向</p>
          <p className="max-w-md text-xs leading-6 text-muted-foreground">
            {requirementsConfirmed
              ? "让 Agent 生成 3 个结构不同的方向，再在这里比较、选择或继续微调。"
              : "先完成需求确认，再生成设计方向。"}
          </p>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={busy || !requirementsConfirmed}
            onClick={() => generate("new")}
          >
            <Sparkles className="size-3.5" />
            生成 3 个方向
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            {list.map((design) => (
              <button
                key={design.id}
                type="button"
                onClick={() => setSelectedId(design.id)}
                className={cn(
                  "border px-3 py-3 text-left transition-colors",
                  design.id === selected?.id
                    ? "border-brand/50 bg-brand-soft/50"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-serif text-sm">
                    {design.title}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto shrink-0 text-3xs",
                      designStatusTone(design.status),
                    )}
                  >
                    {designStatusLabel(design.status)}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-2xs leading-5 text-muted-foreground">
                  {design.thesis}
                </p>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg">
                    {selected.title}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {selected.palette}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-full border border-border p-1">
                  <button
                    type="button"
                    className={cn(
                      "grid size-7 place-items-center rounded-full",
                      !mobilePreview
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                    aria-label="桌面预览"
                    onClick={() => setMobilePreview(false)}
                  >
                    <Monitor className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "grid size-7 place-items-center rounded-full",
                      mobilePreview
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                    aria-label="移动端预览"
                    onClick={() => setMobilePreview(true)}
                  >
                    <Smartphone className="size-3.5" />
                  </button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>

              <div className="flex min-h-[360px] flex-1 justify-center overflow-hidden border border-border bg-muted/20 p-3">
                <iframe
                  key={`${selected.id}-${reloadKey}-${mobilePreview}`}
                  title={`设计方向 ${selected.title}`}
                  src={designPreviewUrl(projectId, selected.id)}
                  sandbox=""
                  className={cn(
                    "h-[520px] border-0 bg-white shadow-sm transition-all",
                    mobilePreview ? "w-[390px] max-w-full" : "w-full",
                  )}
                />
              </div>

              <div className="flex flex-col gap-2 border border-border bg-card p-3">
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="想改哪里？比如：标题太大、项目列表太挤、配色再暖一点……"
                  className="min-h-16 resize-none text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xs text-muted-foreground">
                    选定后会写入 DESIGN.md，再进入实现。
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto rounded-full"
                    disabled={!notes.trim() || busy}
                    onClick={refine}
                  >
                    让 Agent 微调
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full"
                    disabled={busy || selecting}
                    onClick={() => void select(selected)}
                  >
                    {selecting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    选择并继续
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
