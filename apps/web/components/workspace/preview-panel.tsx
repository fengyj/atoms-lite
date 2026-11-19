"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Monitor, Play, RotateCw } from "lucide-react";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/workspace/panel";
import { fetchPreviewStatus, startPreview } from "@/lib/agent";
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
}: {
  className?: string;
  /** 当前项目 ID（用于健康探测） */
  projectId: string;
  /** 预览地址（Worker 上的沙箱预览） */
  url: string;
  /** 变化时重新探测并重载 iframe（工具结果触发） */
  reloadKey: number;
}) {
  const [phase, setPhase] = useState<PreviewPhase>("probing");
  const [active, setActive] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const startingRef = useRef(false);

  // 只探测，不启动：容器在休眠时保持 iframe 不加载。
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const deadline = Date.now() + 60_000;

    setPhase("probing");

    const probe = async () => {
      try {
        const status = await fetchPreviewStatus(projectId, controller.signal);
        if (cancelled || startingRef.current) return;

        if (status.ready) {
          setActive(true);
          setPhase("ready");
          return;
        }

        if (status.running) {
          setActive(true);
          setPhase("loading");
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
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setActive(false);
        setPhase("sleeping");
      }
    };

    void probe();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [projectId, reloadKey]);

  /** 显式启动：只有用户点击启动/刷新或生成后才调用 */
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

  const openExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const meta = phaseMeta[phase];
  const busy = phase === "starting" || phase === "probing";

  return (
    <Panel
      title="预览"
      icon={<Monitor />}
      className={className}
      bodyClassName="overflow-hidden p-2"
      actions={
        <>
          <span
            role="status"
            className="hidden items-center gap-1.5 text-2xs text-muted-foreground sm:inline-flex"
          >
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="启动并刷新预览"
            title="启动并刷新预览（会启动沙箱）"
            disabled={busy}
            onClick={() => void activate()}
          >
            <RotateCw
              className={cn("size-3.5", phase === "starting" && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="新窗口打开"
            onClick={openExternal}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </>
      }
    >
      <WebPreview
        defaultUrl={url}
        className="size-full rounded-md border-border bg-background"
      >
        <WebPreviewNavigation className="border-b-border bg-card px-2 py-1.5">
          <WebPreviewNavigationButton
            tooltip="启动并刷新"
            disabled={busy}
            onClick={() => void activate()}
          >
            <RotateCw
              className={cn("size-3.5", phase === "starting" && "animate-spin")}
            />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 font-mono text-2xs" />
          <WebPreviewNavigationButton tooltip="新窗口" onClick={openExternal}>
            <ExternalLink className="size-3.5" />
          </WebPreviewNavigationButton>
        </WebPreviewNavigation>

        {active ? (
          <WebPreviewBody key={`${reloadKey}-${frameKey}`} />
        ) : (
          <PreviewPlaceholder
            phase={phase}
            note={note}
            onStart={() => void activate()}
          />
        )}
      </WebPreview>
    </Panel>
  );
}

function PreviewPlaceholder({
  phase,
  note,
  onStart,
}: {
  phase: PreviewPhase;
  note: string | null;
  onStart: () => void;
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
    </div>
  );
}
