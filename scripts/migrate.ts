import { loadEnv } from "../src/lib/env";
import { accounts, withAccount } from "../src/lib/accounts";
import { getDb, dbPath } from "../src/lib/db";

loadEnv();
for (const acc of accounts()) {
  withAccount(acc.key, () => {
    const db = getDb(); // opening the database applies pending migrations
    const applied = db.prepare("SELECT id, name, applied_at FROM schema_migrations ORDER BY id").all() as { id: number; name: string; applied_at: string }[];
    console.log(`Database: ${dbPath()}`);
    for (const m of applied) console.log(`  migration ${m.id}: ${m.name} (applied ${m.applied_at})`);
  });
}
console.log("Schema is up to date.");
