/**
 * 发布到 Cloudflare Workers 时使用 D1。
 * 迁移不在这里执行：发布流程在切换 Worker 前先把 migrations/ 应用到目标 D1。
 */
export function createD1Db(d1) {
  return {
    async all(sql, params = []) {
      const result = await d1.prepare(sql).bind(...params).all();
      return result.results ?? [];
    },
    async first(sql, params = []) {
      return (await d1.prepare(sql).bind(...params).first()) ?? null;
    },
    async run(sql, params = []) {
      const result = await d1.prepare(sql).bind(...params).run();
      return {
        changes: result.meta?.changes ?? 0,
        lastInsertRowid: result.meta?.last_row_id ?? 0,
      };
    },
  };
}
