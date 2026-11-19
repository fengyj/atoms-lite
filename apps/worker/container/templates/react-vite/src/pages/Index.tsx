import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          React · TypeScript · Tailwind · shadcn/ui
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            项目已就绪
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            这是一个可构建的 React 模板，使用 Vite、TypeScript、Tailwind CSS 与
            shadcn/ui。描述你的需求，Agent 会在 <code className="rounded bg-muted px-1.5 py-0.5">src/</code>
            中实现页面并运行构建。
          </p>
        </div>

        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>模板组件</CardTitle>
            <CardDescription>
              Button / Card / Input / Badge 已按 shadcn/ui 约定就绪。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Button onClick={() => setCount((value) => value + 1)}>
                点击计数 · {count}
              </Button>
              <Button variant="outline">Secondary</Button>
            </div>
            <Input placeholder="输入框示例" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
