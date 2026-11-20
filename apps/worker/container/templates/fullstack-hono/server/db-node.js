import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function numberId(value) {
  return typeof value === "bigint" ? Number(value) : value;
}

/**
 * 本地开发/容器预览：node:sqlite + 与 D1 相同的 SQL。
 * 迁移在启动时按文件名顺序执行，已应用的版本记录在 schema_migrations。
 */
export function createNodeDb(dataDir, migrationsDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "app.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  if (migrationsDir) {
    const applied = new Set(
      db
        .prepare("SELECT version FROM schema_migrations")
        .all()
        .map((row) => row.version),
    );
    for (const file of readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (applied.has(file)) continue;
      db.exec(readFileSync(join(migrationsDir, file), "utf8"));
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(file, Date.now());
    }
  }

  return {
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async first(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null;
    },
    async run(sql, params = []) {
      const result = db.prepare(sql).run(...params);
      return {
        changes: numberId(result.changes),
        lastInsertRowid: numberId(result.lastInsertRowid),
      };
    },
  };
}
