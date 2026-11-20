import { Hono } from "hono";

/**
 * 共享 API 层：本地 Node 和 Cloudflare Worker 都使用这个 Hono app。
 * db 是一个很小的异步适配器：all(sql, params) / first(sql, params) / run(sql, params)。
 */
export function createApp(db) {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.get("/api/items", async (c) => {
    const items = await db.all("SELECT * FROM items ORDER BY id DESC");
    return c.json({ items });
  });

  app.post("/api/items", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    if (!title) return c.json({ error: "title is required" }, 400);

    const result = await db.run(
      "INSERT INTO items (title, done, created_at) VALUES (?, 0, ?)",
      [title, Date.now()],
    );
    const item = await db.first("SELECT * FROM items WHERE id = ?", [
      result.lastInsertRowid,
    ]);
    return c.json({ item }, 201);
  });

  app.patch("/api/items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    await db.run("UPDATE items SET done = ? WHERE id = ?", [
      body.done ? 1 : 0,
      id,
    ]);
    return c.json({ ok: true });
  });

  app.delete("/api/items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    await db.run("DELETE FROM items WHERE id = ?", [id]);
    return c.json({ ok: true });
  });

  return app;
}
