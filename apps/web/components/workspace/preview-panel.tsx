"use client";

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

export function PreviewPanel({ className }: { className?: string }) {
  return (
    <Panel
      title="预览"
      icon={<Monitor />}
      className={className}
      bodyClassName="overflow-hidden p-2"
      actions={
        <>
          <BadgeReady />
          <Button variant="ghost" size="icon-sm" aria-label="重新加载">
            <RotateCw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="新窗口打开">
            <ExternalLink className="size-3.5" />
          </Button>
        </>
      }
    >
      <WebPreview
        defaultUrl="/demo-preview.html"
        className="size-full rounded-md border-border bg-background"
      >
        <WebPreviewNavigation className="border-b-border bg-card px-2 py-1.5">
          <WebPreviewNavigationButton tooltip="刷新">
            <RotateCw className="size-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 font-mono text-2xs" />
          <WebPreviewNavigationButton tooltip="新窗口">
            <ExternalLink className="size-3.5" />
          </WebPreviewNavigationButton>
        </WebPreviewNavigation>
        <WebPreviewBody src="/demo-preview.html" />
      </WebPreview>
    </Panel>
  );
}

function BadgeReady() {
  return (
    <span className="hidden items-center gap-1.5 text-2xs text-muted-foreground sm:inline-flex">
      <span className="size-1.5 rounded-full bg-success" />
      就绪
    </span>
  );
}
