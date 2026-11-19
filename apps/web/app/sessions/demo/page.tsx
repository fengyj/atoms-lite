"use client";

import { useEffect, useState } from "react";
import { Workspace } from "@/components/workspace/workspace";

export default function SessionPage() {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const segment = window.location.pathname.split("/").filter(Boolean).pop();
    setProjectId(segment || "demo");
  }, []);

  if (!projectId) {
    return (
      <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return <Workspace projectId={projectId} />;
}
