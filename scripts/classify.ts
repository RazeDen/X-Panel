import { loadEnv } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { accounts, withAccount } from "../src/lib/accounts";
import { postProcess } from "../src/lib/x/sync";

/**
 * npm run classify - re-applies the automatic format (series: Animated file / Animated scene / Other)
 * and media type to every post. Manual formats are never touched. Topic, content type and hook
 * tagging (rule-based and AI) were removed at the owner's request on 2026-10-07.
 */
loadEnv();
try {
  for (const acc of accounts()) {
    withAccount(acc.key, () => {
      const db = getDb();
      postProcess();
      const counts = db.prepare(
        "SELECT COALESCE(series, 'none') AS format, COALESCE(series_source, 'none') AS source, COUNT(*) AS n FROM posts WHERE kind IN ('post','quote') AND article_title IS NULL GROUP BY 1, 2 ORDER BY 1, 2"
      ).all();
      console.log(`Formats refreshed (${acc.username ?? acc.key}):`, counts);
    });
  }
} catch (e) {
  console.error(`Classification failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
