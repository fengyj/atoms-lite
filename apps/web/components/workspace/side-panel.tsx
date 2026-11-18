"use client";

import {
  FileArchive,
  FileImage,
  FileText,
  FolderTree,
  Globe,
  History,
  Package,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { artifacts, files, logs, versions } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const logTone: Record<string, string> = {
  cmd: "text-foreground",
  muted: "text-muted-foreground",
  ok: "text-success",
  err: "text-warning",
};

const artifactIcon = {
  web: Globe,
  zip: FileArchive,
  log: FileText,
  pptx: FileText,
  image: FileImage,
} as const;

const versionTone = {
  verified: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  draft: "bg-muted text-muted-foreground border-border",
} as const;

export function SidePanel({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      <Tabs defaultValue="sandbox" className="flex h-full min-h-0 flex-col gap-0">
        <div className="border-b border-border px-2 py-1.5">
          <TabsList className="h-8 w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="sandbox" className="gap-1.5 text-xs">
              <Terminal className="size-3.5" />
              Sandbox
            </TabsTrigger>
            <TabsTrigger value="artifacts" className="gap-1.5 text-xs">
              <Package className="size-3.5" />
              产物
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-1.5 text-xs">
              <History className="size-3.5" />
              版本
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sandbox" className="mt-0 min-h-0 flex-1 overflow-auto scrollbar-thin">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between text-2xs">
              <span className="text-muted-foreground">进程</span>
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-success" />
                pnpm start :3000
              </span>
            </div>
          </div>

          <div className="border-b border-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-2xs text-muted-foreground">
              <FolderTree className="size-3.5" />
              工作区 /workspace
            </div>
            <ul className="space-y-0.5">
              {files.map((file) => (
                <li
                  key={file.path}
                  className={cn(
                    "flex items-center gap-2 rounded py-1 pr-1.5 text-xs hover:bg-accent",
                    file.depth === 0 ? "pl-1.5" : "pl-5"
                  )}
                >
                  <span className={file.kind === "dir" ? "text-muted-foreground" : "text-foreground/80"}>
                    {file.path}
                  </span>
                  {file.change ? (
                    <span
                      className={cn(
                        "ml-auto text-3xs",
                        file.change === "add" && "text-success",
                        file.change === "mod" && "text-warning",
                        file.change === "del" && "text-destructive"
                      )}
                    >
                      {file.change === "add" ? "A" : file.change === "mod" ? "M" : "D"}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-2">
            <div className="mb-1 flex items-center justify-between px-1 text-2xs text-muted-foreground">
              <span>终端</span>
              <span>最后 9 行</span>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-2xs leading-5 scrollbar-thin">
              {logs.map((line, i) => (
                <div key={i} className={logTone[line.tone]}>
                  {line.text}
                </div>
              ))}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="artifacts" className="mt-0 min-h-0 flex-1 overflow-auto p-2 scrollbar-thin">
          <ul className="space-y-1">
            {artifacts.map((item) => {
              const Icon = artifactIcon[item.kind];
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent"
                >
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-3xs text-muted-foreground">{item.size}</span>
                  <span className="text-3xs text-muted-foreground">{item.time}</span>
                </li>
              );
            })}
          </ul>
        </TabsContent>

        <TabsContent value="versions" className="mt-0 min-h-0 flex-1 overflow-auto p-2 scrollbar-thin">
          <ul className="space-y-1.5">
            {versions.map((v) => (
              <li
                key={v.id}
                className={cn(
                  "rounded-md border px-2.5 py-2",
                  v.current ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{v.id}</span>
                  <code className="font-mono text-3xs text-muted-foreground">
                    {v.commit}
                  </code>
                  <span
                    className={cn(
                      "ml-auto rounded-full border px-1.5 py-0.5 text-3xs",
                      versionTone[v.status]
                    )}
                  >
                    {v.status === "verified" ? "已验证" : v.status === "failed" ? "失败" : "草稿"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-2xs text-muted-foreground">
                  {v.summary}
                </p>
                <div className="mt-1 flex items-center gap-2 text-3xs text-muted-foreground/70">
                  <span>{v.time}</span>
                  {v.current ? (
                    <Badge variant="secondary" className="h-4 px-1.5 text-3xs">
                      当前
                    </Badge>
                  ) : (
                    <span className="text-primary/80">回滚</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </section>
  );
}
