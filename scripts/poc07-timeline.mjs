import { execSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const started = Date.now();

const files = execSync(
  `find spikes/poc-06-sdk-audit/.wrangler -path "*do*" -name "*.sqlite" ! -name metadata.sqlite`,
)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);

let best = null;

for (const file of files) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    if (!tables.includes("atoms_run_events")) continue;
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM atoms_run_events")
      .get().n;
    if (count > 0 && (!best || count > best.count)) {
      best = { file, db, count };
    }
  } catch {
    // ignore unreadable db
  }
}

if (!best) {
  console.log(JSON.stringify({ ok: false, error: "no run events found" }));
  process.exit(1);
}

const runs = best.db
  .prepare(
    "SELECT run_id, COUNT(*) AS n, MIN(at) AS t0, MAX(at) AS t1 FROM atoms_run_events GROUP BY run_id ORDER BY t0 DESC LIMIT 3",
  )
  .all();

const latest = runs[0];
const events = best.db
  .prepare(
    "SELECT seq, type, at, data FROM atoms_run_events WHERE run_id = ? ORDER BY seq",
  )
  .all(latest.run_id);

console.log(
  JSON.stringify(
    {
      ok: true,
      locateMs: Date.now() - started,
      db: best.file.split("/").pop(),
      run: latest,
      timeline: events.map((e) => ({
        seq: e.seq,
        type: e.type,
        t: e.at - latest.t0,
        data: JSON.parse(e.data ?? "null"),
      })),
    },
    null,
    2,
  ),
);
