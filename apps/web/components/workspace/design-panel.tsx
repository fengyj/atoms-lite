"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/workspace/inline-error";
import {
  designPreviewUrl,
  type Endpoint,
  type WorkspaceDesignListing,
} from "@/lib/agent";
import type { ElementSelection } from "@/lib/element-selection";
import { useElementPicker } from "@/lib/use-element-picker";
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

function paletteSwatches(palette: string): string[] {
  const matches = palette.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  return [...new Set(matches)].slice(0, 10);
}

function PaletteSwatches({ palette }: { palette: string }) {
  const swatches = paletteSwatches(palette);
  if (!swatches.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {swatches.map((color) => (
        <span
          key={color}
          title={color}
          className="size-3.5 rounded-full border border-border"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

export function DesignPanel({
  projectId,
  designs,
  busy,
  onSelectElement,
}: {
  projectId: string;
  designs: Endpoint<WorkspaceDesignListing>;
  busy: boolean;
  onSelectElement?: (selection: ElementSelection) => void;
}) {
  const list = designs.data?.designs ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pickerActive, setPickerActive] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  const getIframe = useCallback(() => iframeRef.current, []);
  const handlePicked = useCallback(
    (selection: ElementSelection) => {
      setPickerActive(false);
      if (!selected) return;
      onSelectElement?.({
        ...selection,
        source: "design",
        designId: selected.id,
        designTitle: selected.title,
      });
    },
    [onSelectElement, selected],
  );
  const handleCancel = useCallback(() => setPickerActive(false), []);
  const { pickerError } = useElementPicker({
    enabled: pickerActive && Boolean(selected),
    getIframe,
    frameKey: frameLoaded,
    onPicked: handlePicked,
    onCancel: handleCancel,
  });

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const controller = new AbortController();
    setPreviewState("loading");
    setPreviewError(null);
    fetch(`${designPreviewUrl(projectId, selected.id)}?v=${selected.updatedAt}`, {
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
  }, [projectId, selected?.id, selected?.updatedAt, reloadKey]);

  const loadError = designs.error;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Palette className="size-3.5 text-muted-foreground" />
        <h2 className="font-serif text-base font-medium">设计草案</h2>
        {designs.data && designs.data.status !== "none" ? (
          <Badge
            variant="outline"
            className={cn("text-3xs", designStatusTone(designs.data.status))}
          >
            {designStatusLabel(designs.data.status)}
          </Badge>
        ) : null}
        <span className="text-2xs text-muted-foreground">
          {list.length} 个草案
        </span>
        <span className="ml-auto hidden text-3xs text-muted-foreground sm:inline">
          在对话里生成 / 选择
        </span>
      </header>

      {loadError ? (
        <InlineError
          className="mx-4 mt-3 rounded-md"
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
        <>
          <div
            role="tablist"
            aria-label="设计草案"
            className="flex shrink-0 overflow-x-auto border-b border-border bg-muted/20 scrollbar-thin"
          >
            {list.map((design, index) => {
              const active = design.id === selected?.id;
              return (
                <button
                  key={design.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={design.title}
                  onClick={() => {
                    setPickerActive(false);
                    setSelectedId(design.id);
                  }}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 border-r border-border px-3.5 py-2.5 text-left transition-colors",
                    active
                      ? "bg-background text-foreground"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <span className="font-mono text-3xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="max-w-52 truncate text-xs font-medium">
                    {design.title}
                  </span>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      design.status === "selected" ||
                        design.status === "applied"
                        ? "bg-success"
                        : "bg-muted-foreground/40",
                    )}
                    title={designStatusLabel(design.status)}
                  />
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <div className="flex flex-col gap-4 p-4">
                <div className="border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate font-serif text-xl">
                          {selected.title}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-3xs",
                            designStatusTone(selected.status),
                          )}
                        >
                          {designStatusLabel(selected.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs leading-6 text-muted-foreground">
                        {selected.thesis}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border pt-3">
                    <PaletteSwatches palette={selected.palette} />
                    <span className="min-w-0 truncate text-2xs text-muted-foreground">
                      {selected.palette}
                    </span>
                  </div>
                </div>

                <div className="overflow-hidden border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                    <span className="text-3xs tracking-[0.12em] text-muted-foreground uppercase">
                      实时预览
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-border p-1">
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
                    {onSelectElement ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1.5 rounded-full px-2 text-2xs"
                        aria-label={
                          pickerActive ? "取消选择元素" : "选择元素并带到对话"
                        }
                        title={
                          pickerActive ? "取消选择元素" : "选择元素并带到对话"
                        }
                        onClick={() => setPickerActive((value) => !value)}
                      >
                        <Crosshair
                          className={cn(
                            "size-3.5",
                            pickerActive && "text-primary",
                          )}
                        />
                        <span className="hidden sm:inline">选择元素</span>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 rounded-full px-2 text-2xs"
                      onClick={() => setReloadKey((value) => value + 1)}
                    >
                      <RefreshCw className="size-3.5" />
                      <span className="hidden sm:inline">重新加载</span>
                    </Button>
                  </div>

                  {pickerError ? (
                    <InlineError
                      className="m-3 rounded-md"
                      message={pickerError}
                      onRetry={() =>
                        setReloadKey((value) => value + 1)
                      }
                    />
                  ) : null}

                  <div className="relative min-h-[420px] bg-muted/20 p-3">
                    {previewState === "error" ? (
                      <div className="flex min-h-[396px] w-full flex-col items-center justify-center gap-3 px-4 text-center">
                        <span className="grid size-10 place-items-center rounded-full border border-border bg-muted/30 text-muted-foreground">
                          <Palette className="size-4" />
                        </span>
                        <p className="font-serif text-lg">设计稿加载失败</p>
                        <p className="text-2xs leading-5 text-muted-foreground">
                          预览文件没有返回可用内容；设计列表不受影响。
                        </p>
                        <InlineError
                          className="w-full max-w-md text-left"
                          message={previewError ?? "无法加载设计稿"}
                          onRetry={() =>
                            setReloadKey((value) => value + 1)
                          }
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "relative mx-auto w-full",
                          mobilePreview
                            ? "max-w-[390px]"
                            : "max-w-none",
                        )}
                      >
                        {pickerActive ? (
                          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-primary px-3 py-1 text-center text-2xs font-medium text-primary-foreground">
                            点击草案里的元素，把它带到对话里修改
                          </div>
                        ) : null}
                        {previewState === "loading" ? (
                          <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
                            <span className="flex items-center gap-2 text-2xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              加载设计稿…
                            </span>
                          </div>
                        ) : null}
                        <iframe
                          ref={iframeRef}
                          key={`${selected.id}-${selected.updatedAt}-${reloadKey}-${mobilePreview}`}
                          title={`设计草案 ${selected.title}`}
                          src={`${designPreviewUrl(projectId, selected.id)}?v=${selected.updatedAt}`}
                          sandbox="allow-same-origin"
                          onLoad={() => setFrameLoaded((value) => value + 1)}
                          className={cn(
                            "h-[560px] max-w-full border-0 bg-white shadow-sm",
                            mobilePreview ? "w-[390px]" : "w-full",
                          )}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
