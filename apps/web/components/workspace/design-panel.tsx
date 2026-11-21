"use client";

import { useEffect, useState } from "react";
import { Loader2, Monitor, Palette, RefreshCw, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/workspace/inline-error";
import {
  designPreviewUrl,
  type Endpoint,
  type WorkspaceDesignListing,
} from "@/lib/agent";
import { cn } from "@/lib/utils";

function designStatusLabel(status: string): string {
  if (status === "none") return "未开始";
  if (status === "review") return "待选择";
  if (status === "approved") return "已选择";
  if (status === "applied") return "已应用";
  if (status === "selected") return "已选择";
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
  busy,
}: {
  projectId: string;
  designs: Endpoint<WorkspaceDesignListing>;
  busy: boolean;
}) {
  const list = designs.data?.designs ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

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
    // 草案是逐个落库的；Agent 忙碌时轻量轮询，让先完成的方向先出现。
    const timer = window.setInterval(() => designs.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [busy, designs.refresh]);

  const selected =
    list.find((design) => design.id === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const controller = new AbortController();
    setPreviewState("loading");
    setPreviewError(null);
    fetch(designPreviewUrl(projectId, selected.id), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const detail = text.trim().slice(0, 300);
          throw new Error(
            detail
              ? `${detail}（HTTP ${res.status}）`
              : `设计稿加载失败（HTTP ${res.status}）`,
          );
        }
        if (alive) setPreviewState("ready");
      })
      .catch((err) => {
        if (!alive || controller.signal.aborted) return;
        setPreviewError(err instanceof Error ? err.message : String(err));
        setPreviewState("error");
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [projectId, selected?.id, reloadKey]);

  const loadError = designs.error;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Palette className="size-3.5 text-muted-foreground" />
        <h2 className="font-serif text-base font-medium">设计草案</h2>
        {designs.data && designs.data.status !== "none" ? (
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
          {list.length} 个草案
        </span>
      </div>

      {loadError ? (
        <InlineError
          className="mx-4 mt-3"
          message={`设计草案加载失败：${loadError}`}
          onRetry={() => designs.refresh()}
        />
      ) : null}

      {list.length === 0 && !loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full border border-border bg-muted/30 text-muted-foreground">
            <Palette className="size-5" />
          </span>
          <p className="font-serif text-lg">还没有设计草案</p>
          <p className="max-w-md text-xs leading-6 text-muted-foreground">
            在对话里让 Agent 生成或更新设计草案后，会显示在这里。每轮默认 3 个，最多 5 个。
          </p>
        </div>
      ) : list.length === 0 ? null : (
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
                {previewState === "error" ? (
                  <div className="flex w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
                    <span className="grid size-10 place-items-center rounded-full border border-border bg-muted/30 text-muted-foreground">
                      <Palette className="size-4" />
                    </span>
                    <p className="font-serif text-lg">设计稿加载失败</p>
                    <p className="text-2xs leading-5 text-muted-foreground">
                      预览文件没有返回可用内容；设计列表不受影响。
                    </p>
                    <InlineError
                      className="w-full text-left"
                      message={previewError ?? "无法加载设计稿"}
                      onRetry={() => setReloadKey((value) => value + 1)}
                    />
                  </div>
                ) : (
                  <div className="relative flex w-full justify-center">
                    {previewState === "loading" ? (
                      <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
                        <span className="flex items-center gap-2 text-2xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          加载设计稿…
                        </span>
                      </div>
                    ) : null}
                    <iframe
                      key={`${selected.id}-${reloadKey}-${mobilePreview}`}
                      title={`设计草案 ${selected.title}`}
                      src={designPreviewUrl(projectId, selected.id)}
                      sandbox=""
                      className={cn(
                        "h-[520px] border-0 bg-white shadow-sm transition-all",
                        mobilePreview ? "w-[390px] max-w-full" : "w-full",
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
