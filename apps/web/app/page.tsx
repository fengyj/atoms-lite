"use client";

import { useEffect, useState } from "react";
import { Workspace } from "@/components/workspace/workspace";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return <Workspace />;
}
