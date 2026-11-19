import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST_DIR = process.env.DIST_DIR || join(process.cwd(), "dist");
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(`${DATA_DIR}/app.db`);
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

app.get("/api/items", (c) => {
  const items = db.prepare("SELECT * FROM items ORDER BY id DESC").all();
  return c.json({ items });
});

app.post("/api/items", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return c.json({ error: "title is required" }, 400);

  const result = db
    .prepare("INSERT INTO items (title, done, created_at) VALUES (?, 0, ?)")
    .run(title, Date.now());
  const item = db
    .prepare("SELECT * FROM items WHERE id = ?")
    .get(Number(result.lastInsertRowid));
  return c.json({ item }, 201);
});

app.patch("/api/items/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const done = body.done ? 1 : 0;
  db.prepare("UPDATE items SET done = ? WHERE id = ?").run(done, id);
  return c.json({ ok: true });
});

app.delete("/api/items/:id", (c) => {
  const id = Number(c.req.param("id"));
  db.prepare("DELETE FROM items WHERE id = ?").run(id);
  return c.json({ ok: true });
});

app.use("/*", serveStatic({ root: DIST_DIR }));
app.get("*", serveStatic({ path: join(DIST_DIR, "index.html") }));

serve({ fetch: app.fetch, port: 8080, hostname: "0.0.0.0" });
console.log("fullstack app on 0.0.0.0:8080");
