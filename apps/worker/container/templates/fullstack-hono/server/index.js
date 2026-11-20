import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.js";
import { createNodeDb } from "./db-node.js";

const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST_DIR = process.env.DIST_DIR || join(process.cwd(), "dist");
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR || join(process.cwd(), "migrations");

const db = createNodeDb(DATA_DIR, MIGRATIONS_DIR);
const app = createApp(db);

app.use("/*", serveStatic({ root: DIST_DIR }));
app.get("*", serveStatic({ path: join(DIST_DIR, "index.html") }));

serve({ fetch: app.fetch, port: 8080, hostname: "0.0.0.0" });
console.log("fullstack app on 0.0.0.0:8080");
