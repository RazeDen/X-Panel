/**
 * npm run backup - consistent copy of every account's database (SQLite online backup, safe while the
 * dashboard or a sync is running) to data/backups/<file>-YYYY-MM-DD.db, e.g. analytics-2026-10-29.db
 * and analytics-secondhandle-2026-10-29.db. Keeps the newest 14 dated files per database; any other file in
 * data/backups is left alone. Run daily by x-panel-backup.timer.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/lib/env";

loadEnv();
const KEEP = 14;

async function main() {
  const { accounts, withAccount } = await import("../src/lib/accounts");
  const { getDb } = await import("../src/lib/db");
  const dir = path.resolve("data/backups");
  fs.mkdirSync(dir, { recursive: true });
  for (const acc of accounts()) {
    const stem = path.basename(acc.dbFile, ".db");
    const pattern = new RegExp(`^${stem}-\\d{4}-\\d{2}-\\d{2}\\.db$`);
    const file = path.join(dir, `${stem}-${new Date().toISOString().slice(0, 10)}.db`);
    await withAccount(acc.key, () => getDb().backup(file));
    const dated = fs.readdirSync(dir).filter((f) => pattern.test(f)).sort();
    for (const old of dated.slice(0, Math.max(0, dated.length - KEEP))) fs.rmSync(path.join(dir, old));
    console.log(`Backup written: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB); keeping ${Math.min(dated.length, KEEP)} dated backups`);
  }
}

main().catch((e) => {
  console.error(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
