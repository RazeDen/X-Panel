import { loadEnv } from "../src/lib/env";
import { runSync, DEFAULT_WINDOW_DAYS } from "../src/lib/x/sync";
import { XApiError } from "../src/lib/x/client";

/**
 * npm run sync              incremental: posts from the last 45 days
 * npm run sync -- --days=90 incremental with a custom window
 * npm run sync -- --full    whole timeline (also: npm run sync:full)
 */
loadEnv();
const args = process.argv.slice(2);
const full = args.includes("--full");
const daysArg = args.find((a) => a.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : DEFAULT_WINDOW_DAYS;

async function main() {
  const t0 = Date.now();
  const r = await runSync({ mode: full ? "full" : "incremental", days, log: (m) => console.log(`  ${m}`) });
  console.log(`\nSync complete (${r.mode}${r.windowStart ? `, since ${r.windowStart.slice(0, 10)}` : ""}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Account:        @${r.account.username} (${r.account.followers ?? "?"} followers)`);
  console.log(`  Posts fetched:  ${r.fetched}`);
  console.log(`  New posts:      ${r.inserted}`);
  console.log(`  Updated posts:  ${r.updated}`);
  console.log(`  Snapshots:      ${r.snapshots}`);
  console.log(`  API requests:   ${r.apiRequests}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
}

main().catch((err) => {
  const kind = err instanceof XApiError ? ` [${err.kind}]` : "";
  console.error(`\nSync failed${kind}: ${err instanceof Error ? err.message : err}`);
  console.error("No data was changed. Existing posts and history are intact.");
  process.exit(1);
});
