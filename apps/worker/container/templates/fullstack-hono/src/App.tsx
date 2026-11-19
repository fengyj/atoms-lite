import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Item = {
  id: number;
  title: string;
  done: number;
  created_at: number;
};

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const res = await fetch("./api/items");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { items?: Item[] };
    setItems(data.items ?? []);
  };

  useEffect(() => {
    load().catch((err) => setError(String(err)));
  }, []);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;

    const res = await fetch("./api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: value }),
    });
    if (!res.ok) {
      setError(`创建失败：HTTP ${res.status}`);
      return;
    }
    setTitle("");
    setError("");
    await load();
  };

  const toggle = async (item: Item) => {
    await fetch(`./api/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !item.done }),
    });
    await load();
  };

  const remove = async (item: Item) => {
    await fetch(`./api/items/${item.id}`, { method: "DELETE" });
    await load();
  };

  const done = items.filter((item) => item.done).length;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/15 text-primary">Full-stack</Badge>
          <span className="text-xs text-muted-foreground">
            React · TypeScript · Tailwind · shadcn/ui · Hono · SQLite
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">待办清单</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          前端构建到 <code className="rounded bg-muted px-1.5 py-0.5">dist/</code>，
          Hono 提供同源 API，数据保存在容器的 SQLite。
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>任务</CardTitle>
            <CardDescription>
              已完成 {done} / 共 {items.length} 项
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={add}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="要做什么？按回车添加"
              />
              <Button type="submit" className="gap-1.5">
                <Plus className="size-4" />
                添加
              </Button>
            </form>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <ul className="space-y-2">
              {items.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  还没有任务，先添加第一条吧。
                </li>
              ) : (
                items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
                  >
                    <Button
                      type="button"
                      variant={item.done ? "default" : "outline"}
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => void toggle(item)}
                      aria-label={item.done ? "标记未完成" : "标记完成"}
                    >
                      {item.done ? "✓" : "○"}
                    </Button>
                    <span
                      className={
                        item.done
                          ? "flex-1 text-sm text-muted-foreground line-through"
                          : "flex-1 text-sm"
                      }
                    >
                      {item.title}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => void remove(item)}
                      aria-label="删除"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
