import { loadEnv } from "../src/lib/env";
import { accounts, withAccount } from "../src/lib/accounts";
import { DEFAULT_WINDOW_DAYS } from "../src/lib/x/sync";
import { syncAccount } from "../src/lib/x/run";
import { XApiError } from "../src/lib/x/client";

/**
 * npm run sync                     incremental: posts from the last 45 days, every account
 * npm run sync -- --days=90        incremental with a custom window
 * npm run sync -- --full           whole timeline (also: npm run sync:full)
 * npm run sync -- --account=secondhandle one account only (main = the X API account)
 */
loadEnv();
const args = process.argv.slice(2);
const full = args.includes("--full");
const daysArg = args.find((a) => a.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : DEFAULT_WINDOW_DAYS;
const only = args.find((a) => a.startsWith("--account="))?.split("=")[1]?.toLowerCase();

async function main() {
  const list = accounts().filter((a) => !only || a.key === only);
  if (!list.length) throw new Error(`Unknown account "${only}". Known: ${accounts().map((a) => a.key).join(", ")}`);
  let failed = 0;
  for (const acc of list) {
    await withAccount(acc.key, async () => {
      const t0 = Date.now();
      console.log(`\n== ${acc.username ? `@${acc.username}` : "main account"} (${acc.source === "x" ? "X API" : "twitterapi.io"})`);
      try {
        const r = await syncAccount({ mode: full ? "full" : "incremental", days, log: (m) => console.log(`  ${m}`) });
        console.log(`Sync complete (${r.mode}${r.windowStart ? `, since ${r.windowStart.slice(0, 10)}` : ""}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        console.log(`  Account:        @${r.account.username} (${r.account.followers ?? "?"} followers)`);
        console.log(`  Posts fetched:  ${r.fetched}`);
        console.log(`  New posts:      ${r.inserted}`);
        console.log(`  Updated posts:  ${r.updated}`);
        console.log(`  Snapshots:      ${r.snapshots}`);
        console.log(`  API requests:   ${r.apiRequests}`);
        for (const w of r.warnings) console.log(`  ! ${w}`);
      } catch (err) {
        failed++;
        const kind = err instanceof XApiError ? ` [${err.kind}]` : "";
        console.error(`Sync failed${kind}: ${err instanceof Error ? err.message : err}`);
        console.error("No data was changed. Existing posts and history are intact.");
      }
    });
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(`\nSync failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
