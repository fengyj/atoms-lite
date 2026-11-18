"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Monitor, RotateCw } from "lucide-react";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/workspace/panel";
import { cn } from "@/lib/utils";

type PreviewPhase = "loading" | "ready" | "error";

const phaseMeta: Record<PreviewPhase, { dot: string; label: string }> = {
  loading: { dot: "animate-pulse bg-warning", label: "加载中" },
  ready: { dot: "bg-success", label: "就绪" },
  error: { dot: "bg-destructive", label: "失败" },
};

export function PreviewPanel({
  className,
  url,
  reloadKey,
  onRefresh,
}: {
  className?: string;
  /** 预览地址（Worker 上的沙箱预览） */
  url: string;
  /** 变化时强制重载 iframe（工具结果触发） */
  reloadKey: number;
  onRefresh: () => void;
}) {
  const [phase, setPhase] = useState<PreviewPhase>("loading");

  // 工具结果或手动刷新导致的重载：先回到加载态
  useEffect(() => {
    setPhase("loading");
  }, [reloadKey, url]);

  const openExternal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const meta = phaseMeta[phase];

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
            aria-label="重新加载"
            onClick={onRefresh}
          >
            <RotateCw className="size-3.5" />
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
          <WebPreviewNavigationButton tooltip="刷新" onClick={onRefresh}>
            <RotateCw className="size-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 font-mono text-2xs" />
          <WebPreviewNavigationButton tooltip="新窗口" onClick={openExternal}>
            <ExternalLink className="size-3.5" />
          </WebPreviewNavigationButton>
        </WebPreviewNavigation>
        <WebPreviewBody
          key={reloadKey}
          onLoad={() => setPhase("ready")}
          onError={() => setPhase("error")}
        />
      </WebPreview>
    </Panel>
  );
}
