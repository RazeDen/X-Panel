/**
 * npm run backup - consistent copy of data/analytics.db (SQLite online backup, safe while the
 * dashboard or a sync is running) to data/backups/analytics-YYYY-MM-DD.db. Keeps the newest 14 of
 * these dated files; any other file in data/backups is left alone. Run daily by x-panel-backup.timer.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/lib/env";

loadEnv();
const KEEP = 14;
const PATTERN = /^analytics-\d{4}-\d{2}-\d{2}\.db$/;

async function main() {
  const { getDb } = await import("../src/lib/db");
  const dir = path.resolve("data/backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `analytics-${new Date().toISOString().slice(0, 10)}.db`);
  await getDb().backup(file);
  const dated = fs.readdirSync(dir).filter((f) => PATTERN.test(f)).sort();
  for (const old of dated.slice(0, Math.max(0, dated.length - KEEP))) fs.rmSync(path.join(dir, old));
  console.log(`Backup written: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB); keeping ${Math.min(dated.length, KEEP)} dated backups`);
}

main().catch((e) => {
  console.error(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
