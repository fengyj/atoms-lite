import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function App() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
        <Badge className="w-fit gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          Full-stack ready
        </Badge>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            等待生成
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            这是一个可构建的全栈模板：React + TypeScript + Tailwind + shadcn/ui，
            后端是 Hono + SQLite。描述你的需求，Agent 会在这里实现页面和接口。
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
          当前是模板占位页，不是可用的业务应用。生成完成后会自动替换。
        </div>
      </div>
    </main>
  );
}
