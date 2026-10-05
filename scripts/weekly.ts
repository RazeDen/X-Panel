import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { runSync } from "../src/lib/x/sync";
import { XApiError } from "../src/lib/x/client";
import { loadPosts } from "../src/lib/data";
import { buildWeeklyReport } from "../src/lib/analytics/weekly";
import { reportToMarkdown, saveReport } from "../src/lib/analytics/report-store";
import { aiAvailable, aiModel, anthropic, classifyWithAI } from "../src/lib/classify/ai";
import { saveClassification } from "../src/lib/classify/store";
import { addDays, today, weekFromKey, weekOfDate } from "../src/lib/time";
import { fmtInt, fmtRate, fmtDelta, preview } from "../src/lib/format";

/**
 * npm run weekly                     sync, then report on the last completed week (Mon-Sun, Europe/Warsaw)
 * npm run weekly -- --week=2026-W40  a specific week
 * npm run weekly -- --current        the week in progress
 * npm run weekly -- --no-sync        skip the X sync (use what is stored)
 * npm run weekly -- --no-ai          skip optional AI steps even if a key is configured
 */
loadEnv();
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const weekArg = args.find((a) => a.startsWith("--week="))?.split("=")[1];

async function main() {
  const now = new Date();
  const target = weekArg ? weekFromKey(weekArg) : has("--current") ? weekOfDate(today(now)) : weekOfDate(addDays(today(now), -7));
  if (!target) throw new Error(`Invalid week "${weekArg}". Use the form 2026-W40.`);
  const db = getDb();
  let syncNote = "skipped (--no-sync)";

  // 1-3. sync, update database, save snapshots
  if (!has("--no-sync")) {
    try {
      const r = await runSync({ mode: "incremental", log: () => {} });
      syncNote = `${r.fetched} posts fetched, ${r.inserted} new, ${r.snapshots} snapshots`;
      for (const w of r.warnings) console.log(`  ! ${w}`);
    } catch (err) {
      const kind = err instanceof XApiError ? ` [${err.kind}]` : "";
      console.error(`Sync failed${kind}: ${err instanceof Error ? err.message : err}`);
      console.error("Continuing with the data already stored. The report below does NOT include fresh numbers.\n");
      syncNote = "FAILED - report built from stored data";
    }
  }

  // 8a. optional AI tagging of anything still on rule-based tags
  const useAI = aiAvailable() && !has("--no-ai");
  if (useAI) {
    const untagged = db.prepare("SELECT id, text FROM posts WHERE kind IN ('post','quote') AND (class_source IS NULL OR class_source = 'rule')").all() as { id: number; text: string }[];
    if (untagged.length) {
      try {
        const res = await classifyWithAI(untagged);
        for (const [id, c] of res) saveClassification(id, c, "ai", aiModel());
        console.log(`  AI-tagged ${res.size} post(s).`);
      } catch (e) {
        console.error(`  AI tagging skipped: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // 4-7. derived metrics, weekly aggregates, outliers
  const { originals } = loadPosts();
  const report = buildWeeklyReport(originals, target.key, now);
  if (!report) throw new Error("Could not build the report.");

  // 8b. optional written analysis, strictly from the computed report
  let ai: { text: string; model: string } | null = null;
  if (useAI && report.summary.n > 0) {
    try {
      const text = await anthropic(
        "You are an analyst writing a short weekly review of one X account's posts. Use ONLY the JSON data provided. " +
          "Every factual sentence must be traceable to a number in the data and should quote the sample size. " +
          "Prefix measured facts with 'DATA:' and any interpretation with 'HYPOTHESIS:'. Never state a cause as fact, never claim the platform suppressed or boosted anything. " +
          "Sections: What worked, What underperformed, Interesting signals, Hypotheses, Suggested experiments. Under 350 words.",
        JSON.stringify({ ...report, byDow: undefined }),
        1200
      );
      ai = { text: text.trim(), model: aiModel() };
    } catch (e) {
      console.error(`  AI analysis skipped: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 9. validate against the database before saving
  const check = db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(impressions),0) AS imp FROM posts WHERE kind IN ('post','quote') AND article_title IS NULL`
  ).get() as { n: number; imp: number };
  const problems: string[] = [];
  if (check.n !== originals.length) problems.push(`post count mismatch (db ${check.n}, loaded ${originals.length})`);
  const weekSum = originals.filter((p) => p.localDate >= target.start && p.localDate <= target.end).reduce((a, p) => a + (p.impressions ?? 0), 0);
  if ((report.summary.totalImpressions ?? 0) !== weekSum) problems.push("weekly impression total does not match the sum of its posts");
  for (const [k, v] of Object.entries(report.summary)) if (typeof v === "number" && !Number.isFinite(v)) problems.push(`non-finite value in summary.${k}`);
  if (problems.length) throw new Error(`Validation failed: ${problems.join("; ")}. Report not saved.`);

  saveReport(report, ai);
  const dir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${target.key}.md`);
  fs.writeFileSync(file, reportToMarkdown(report, ai?.text));

  // 10. concise summary
  const s = report.summary;
  const top = report.topPosts[0];
  console.log(`Week ${target.week} processed (${target.label}, ${target.year})${report.complete ? "" : " - week still in progress"}`);
  console.log(`Sync: ${syncNote}`);
  console.log(`Posts: ${s.n}`);
  console.log(`Total impressions: ${fmtInt(s.totalImpressions)} (${fmtDelta(report.vsPrevious.totalImpressions.change)} vs previous week)`);
  console.log(`Median impressions: ${fmtInt(s.medianImpressions)} (${fmtDelta(report.vsPrevious.medianImpressions.change)} vs previous week, ${fmtDelta(report.vsBaseline.medianImpressions.change)} vs 30-day baseline)`);
  console.log(`Median engagement rate: ${fmtRate(s.medianEngagementRate)}`);
  if (top) console.log(`Top post: ${fmtInt(top.impressions)} impressions - "${preview(top.preview, 70)}"`);
  console.log(`Outliers: ${report.positiveOutliers.length} above baseline, ${report.negativeOutliers.length} below`);
  for (const w of report.warnings) console.log(`Note: ${w}`);
  console.log(`AI analysis: ${ai ? `generated with ${ai.model}` : aiAvailable() ? "skipped" : "not configured (ANTHROPIC_API_KEY not set)"}`);
  console.log(`Validation: ok`);
  console.log(`Report saved successfully: reports/${target.key}.md (also in the dashboard under Weekly)`);
}

main().catch((err) => {
  console.error(`Weekly run failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
