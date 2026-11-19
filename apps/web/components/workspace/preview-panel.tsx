"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  ExternalLink,
  Loader2,
  Monitor,
  Play,
  RotateCw,
  ScanSearch,
  X,
} from "lucide-react";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { Button } from "@/components/ui/button";
import { fetchPreviewStatus, startPreview } from "@/lib/agent";
import {
  collectElementSelection,
  type ElementSelection,
} from "@/lib/element-selection";
import { scanDesign, type DesignFinding } from "@/lib/design-check";
import { cn } from "@/lib/utils";

type PreviewPhase =
  | "probing"
  | "sleeping"
  | "starting"
  | "loading"
  | "ready"
  | "error";

const phaseMeta: Record<PreviewPhase, { dot: string; label: string }> = {
  probing: { dot: "animate-pulse bg-warning", label: "检测中" },
  sleeping: { dot: "bg-muted-foreground", label: "已休眠" },
  starting: { dot: "animate-pulse bg-warning", label: "启动中" },
  loading: { dot: "animate-pulse bg-warning", label: "加载中" },
  ready: { dot: "bg-success", label: "就绪" },
  error: { dot: "bg-destructive", label: "失败" },
};

export function PreviewPanel({
  className,
  projectId,
  url,
  reloadKey,
  onSelectElement,
}: {
  className?: string;
  /** 当前项目 ID（用于健康探测） */
  projectId: string;
  /** 预览地址（Worker 上的沙箱预览） */
  url: string;
  /** 变化时重新探测并重载 iframe（工具结果触发） */
  reloadKey: number;
  /** 在预览里选中一个元素，把 DOM/样式上下文带回对话 */
  onSelectElement?: (selection: ElementSelection) => void;
}) {
  const [phase, setPhase] = useState<PreviewPhase>("probing");
  const [active, setActive] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const [pickerActive, setPickerActive] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(0);
  const [findings, setFindings] = useState<DesignFinding[]>([]);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(false);

  // 页面重新可见 / 窗口聚焦时重新探测，避免刷新后把活着的沙箱当成休眠。
  useEffect(() => {
    const check = () => setCheckNonce((value) => value + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // 预览元素选择：只在用户主动开启时给 iframe 挂事件。
  useEffect(() => {
    if (!pickerActive || !active) return;
    const iframe = frameWrapRef.current?.querySelector("iframe");
    let doc: Document | null = null;
    try {
      doc = iframe?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) {
      setPickerError("无法读取预览 DOM：本地开发时预览与主站不同源，生产环境可用。");
      return;
    }

    setPickerError(null);
    let highlighted: HTMLElement | null = null;
    let previousOutline = "";
    let previousOffset = "";

    const clearHighlight = () => {
      if (!highlighted) return;
      highlighted.style.outline = previousOutline;
      highlighted.style.outlineOffset = previousOffset;
      highlighted = null;
    };

    const onOver = (event: Event) => {
      const target = event.target;
      if (!(target instanceof doc!.defaultView!.HTMLElement)) return;
      if (target === highlighted) return;
      clearHighlight();
      highlighted = target;
      previousOutline = target.style.outline;
      previousOffset = target.style.outlineOffset;
      target.style.outline = "2px solid #8f9fff";
      target.style.outlineOffset = "2px";
    };

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof doc!.defaultView!.Element)) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = collectElementSelection(target);
      clearHighlight();
      setPickerActive(false);
      onSelectElement?.(selection);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearHighlight();
        setPickerActive(false);
      }
    };

    doc.addEventListener("mouseover", onOver, true);
    doc.addEventListener("mouseout", clearHighlight, true);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("keydown", onKey, true);
    return () => {
      clearHighlight();
      doc?.removeEventListener("mouseover", onOver, true);
      doc?.removeEventListener("mouseout", clearHighlight, true);
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("keydown", onKey, true);
    };
  }, [pickerActive, active, frameLoaded, onSelectElement]);

  // 只探测，不启动：容器在休眠时保持 iframe 不加载。
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let deadline: number | null = null;

    setPhase("probing");

    const probe = async () => {
      try {
        const status = await fetchPreviewStatus(projectId, controller.signal);
        if (cancelled || startingRef.current) return;

        if (status.ready) {
          setActive(true);
          setPhase("ready");
          setNote(null);
          return;
        }

        if (status.running) {
          setActive(true);
          setPhase("loading");
          deadline ??= Date.now() + 60_000;
          if (Date.now() >= deadline) {
            setPhase("error");
            setNote("预览服务在规定时间内没有就绪。");
            return;
          }
          timer = setTimeout(probe, 1200);
          return;
        }

        setActive(false);
        setPhase("sleeping");
        setNote(null);
        // 沙箱可能因为文件工具/agent 操作刚启动；休眠时低频复查，不启动容器。
        timer = setTimeout(probe, 5_000);
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setActive(false);
        setPhase("sleeping");
        // Worker 暂时不可达时也继续重试，而不是永久停在休眠。
        timer = setTimeout(probe, 5_000);
      }
    };

    void probe();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [projectId, reloadKey, checkNonce]);

  /** 冷启动：容器休眠或预览未就绪时调用 */
  const activate = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPhase("starting");
    setNote(null);
    try {
      await startPreview(projectId);
      setActive(true);
      setFrameKey((key) => key + 1);
      setPhase("ready");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setPhase("error");
    } finally {
      startingRef.current = false;
    }
  }, [projectId]);

  /**
   * 手动刷新：预览已就绪时只重载 iframe，不再重启服务。
   * 重启会有一小段时间仍返回旧进程的响应，容易让 iframe 停在旧内容上。
   */
  const refresh = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPhase("starting");
    setNote(null);
    try {
      let ready = false;
      try {
        ready = (await fetchPreviewStatus(projectId)).ready;
      } catch {
        // 探测失败时按冷启动处理，由 startPreview 给出明确错误。
      }
      if (!ready) await startPreview(projectId);
      setActive(true);
      setFrameKey((key) => key + 1);
      setPhase("ready");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setPhase("error");
    } finally {
      startingRef.current = false;
    }
  }, [projectId]);

  const openExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const scan = useCallback(() => {
    const iframe = frameWrapRef.current?.querySelector("iframe");
    let doc: Document | null = null;
    try {
      doc = iframe?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) {
      setScanError("无法读取预览 DOM：本地开发时预览与主站不同源，生产环境可用。");
      return;
    }
    setScanError(null);
    setFindings(scanDesign(doc));
    setFindingsOpen(true);
  }, []);

  const meta = phaseMeta[phase];
  const busy = phase === "starting" || phase === "probing";
  // 每次刷新都换 URL，避免浏览器/代理把 iframe 文档当作同一次导航复用。
  const frameSrc = `${url}${url.includes("?") ? "&" : "?"}__atoms=${reloadKey}-${frameKey}`;

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <WebPreview
        defaultUrl={url}
        className="size-full rounded-none border-0 bg-background"
      >
        <WebPreviewNavigation className="border-b-border bg-card px-2 py-1.5">
          <WebPreviewNavigationButton
            tooltip="刷新预览"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RotateCw
              className={cn("size-3.5", phase === "starting" && "animate-spin")}
            />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 font-mono text-2xs" />
          <span
            role="status"
            className="ml-1 hidden items-center gap-1.5 px-1 text-2xs whitespace-nowrap text-muted-foreground sm:inline-flex"
          >
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          {active ? (
            <WebPreviewNavigationButton
              tooltip="检查设计"
              onClick={scan}
            >
              <span className="relative">
                <ScanSearch className="size-3.5" />
                {findings.length > 0 ? (
                  <span className="absolute -top-1.5 -right-2 rounded-full bg-warning px-1 text-3xs text-background">
                    {findings.length}
                  </span>
                ) : null}
              </span>
            </WebPreviewNavigationButton>
          ) : null}
          {onSelectElement ? (
            <WebPreviewNavigationButton
              tooltip={pickerActive ? "取消选择元素" : "选择元素并带到对话"}
              onClick={() => {
                setPickerError(null);
                setPickerActive((value) => !value);
              }}
            >
              <Crosshair
                className={cn("size-3.5", pickerActive && "text-primary")}
              />
            </WebPreviewNavigationButton>
          ) : null}
          <WebPreviewNavigationButton tooltip="新窗口" onClick={openExternal}>
            <ExternalLink className="size-3.5" />
          </WebPreviewNavigationButton>
        </WebPreviewNavigation>

        {findingsOpen ? (
          <div className="max-h-56 shrink-0 overflow-auto border-b border-border bg-card px-3 py-2 scrollbar-thin">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs font-medium">
                设计检查
                <span className="ml-1 text-muted-foreground">
                  {findings.length} 条
                </span>
              </span>
              <span className="flex items-center gap-2 text-3xs text-muted-foreground">
                <button
                  type="button"
                  onClick={scan}
                  className="hover:text-foreground"
                >
                  重新扫描
                </button>
                <button
                  type="button"
                  aria-label="关闭设计检查"
                  onClick={() => setFindingsOpen(false)}
                  className="hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            </div>
            {findings.length === 0 ? (
              <p className="mt-2 text-2xs text-muted-foreground">
                未发现明显的小字、低对比度、溢出或过小点击目标。
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {findings.map((finding) => (
                  <li key={finding.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectElement?.(collectElementSelection(finding.element));
                        setFindingsOpen(false);
                      }}
                      className="w-full rounded-md px-1.5 py-1 text-left text-2xs transition-colors hover:bg-accent"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            finding.severity === "warning"
                              ? "bg-warning"
                              : "bg-muted-foreground",
                          )}
                        />
                        <span className="font-medium">{finding.rule}</span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {finding.message}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate pl-3 font-mono text-3xs text-muted-foreground">
                        {finding.selector}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {scanError ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-2xs text-destructive">
            {scanError}
          </div>
        ) : null}
        {pickerError ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-2xs text-destructive">
            {pickerError}
          </div>
        ) : null}
        {active ? (
          <div ref={frameWrapRef} className="relative flex min-h-0 flex-1">
            <WebPreviewBody
              key={`${reloadKey}-${frameKey}`}
              src={frameSrc}
              onLoad={() => setFrameLoaded((value) => value + 1)}
            />
            {pickerActive ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-primary px-3 py-1 text-center text-2xs font-medium text-primary-foreground">
                点击预览里的元素，把它带到对话里修改
              </div>
            ) : null}
          </div>
        ) : (
          <PreviewPlaceholder
            phase={phase}
            note={note}
            onStart={() => void activate()}
            onCheck={() => setCheckNonce((value) => value + 1)}
          />
        )}
      </WebPreview>
    </div>
  );
}

function PreviewPlaceholder({
  phase,
  note,
  onStart,
  onCheck,
}: {
  phase: PreviewPhase;
  note: string | null;
  onStart: () => void;
  onCheck: () => void;
}) {
  const starting = phase === "starting";
  const failed = phase === "error";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-border bg-card">
        {starting || phase === "probing" ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Monitor className="size-4 text-muted-foreground" />
        )}
      </span>
      <div>
        <p className="text-sm font-medium">
          {failed
            ? "预览启动失败"
            : starting
              ? "正在启动沙箱…"
              : phase === "probing"
                ? "检查预览状态…"
                : "预览已休眠"}
        </p>
        <p className="mt-1 max-w-64 text-2xs leading-5 text-muted-foreground">
          {failed
            ? note || "无法启动预览服务，请重试。"
            : "沙箱空闲 5 分钟后自动回收。点击启动会恢复沙箱并加载预览。"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={starting || phase === "probing"}
          onClick={onStart}
        >
          {starting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {failed ? "重试" : "启动预览"}
        </Button>
        {phase === "sleeping" || failed ? (
          <Button size="sm" variant="ghost" onClick={onCheck}>
            重新检查
          </Button>
        ) : null}
      </div>
    </div>
  );
}
