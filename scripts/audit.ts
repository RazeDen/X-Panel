import { loadEnv } from "../src/lib/env";
import { XClient, XApiError } from "../src/lib/x/client";
import { getDb } from "../src/lib/db";
import { refreshCapabilities } from "../src/lib/capabilities";

/**
 * npm run audit:x - verifies the X connection with a small live request (profile + 5 recent posts)
 * and prints which metric fields X returns, followed by the stored capability report.
 */
loadEnv();
async function main() {
  const client = new XClient();
  const me = (await client.get<{ data: { id: string; username: string; public_metrics?: Record<string, number> } }>("/users/me", { "user.fields": "public_metrics" })).data;
  console.log(`Authenticated as @${me.username} (OAuth 1.0a user context). Followers: ${me.public_metrics?.followers_count ?? "?"}`);
  const page = await client.get<{ data?: Record<string, unknown>[]; includes?: { media?: Record<string, unknown>[] } }>(`/users/${me.id}/tweets`, {
    max_results: 5, exclude: "retweets",
    "tweet.fields": "created_at,public_metrics,non_public_metrics,organic_metrics,attachments",
    "media.fields": "type,public_metrics,non_public_metrics", expansions: "attachments.media_keys",
  });
  const fields = new Map<string, number>();
  const add = (prefix: string, o: unknown) => { if (o && typeof o === "object") for (const k of Object.keys(o)) fields.set(`${prefix}.${k}`, (fields.get(`${prefix}.${k}`) ?? 0) + 1); };
  for (const t of page.data ?? []) { add("public_metrics", t.public_metrics); add("non_public_metrics", t.non_public_metrics); add("organic_metrics", t.organic_metrics); }
  for (const m of page.includes?.media ?? []) { add("media.public_metrics", m.public_metrics); add("media.non_public_metrics", m.non_public_metrics); }
  console.log(`\nFields returned for the ${page.data?.length ?? 0} most recent posts (field: posts/media carrying it):`);
  for (const [k, n] of [...fields.entries()].sort()) console.log(`  ${k}: ${n}`);

  getDb();
  const caps = refreshCapabilities();
  console.log("\nCapability report (from stored posts):");
  for (const c of caps) console.log(`  ${c.label.padEnd(46)} ${c.status.padEnd(12)} ${c.posts_checked === null ? "" : `${c.posts_with_value}/${c.posts_checked}`}`);
  console.log(`\nAPI requests made: ${client.requests}`);
}
main().catch((e) => { console.error(`Audit failed${e instanceof XApiError ? ` [${e.kind}]` : ""}: ${e instanceof Error ? e.message : e}`); process.exit(1); });
