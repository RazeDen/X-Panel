import fs from "node:fs";
import { loadEnv } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { postProcess } from "../src/lib/x/sync";
import { aiAvailable, aiModel, classifyWithAI } from "../src/lib/classify/ai";
import { saveClassification } from "../src/lib/classify/store";

/**
 * npm run classify                      re-apply rule-based tags (never touches manual or AI tags)
 * npm run classify -- --ai              tag posts that have no manual/AI tag yet (needs ANTHROPIC_API_KEY)
 * npm run classify -- --ai --all        re-tag everything except manual tags
 * npm run classify -- --export f.json   write {x_id, text, tags} for every original post
 * npm run classify -- --import f.json   load tags from a JSON file: [{x_id, topic, subtopic, content_type, hook_type, is_news, source?}]
 */
loadEnv();
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const db = getDb();
  if (value("--export")) {
    const rows = db.prepare("SELECT x_id, created_at, text, topic, subtopic, content_type, hook_type, is_news, class_source FROM posts WHERE kind IN ('post','quote') ORDER BY created_at DESC").all();
    fs.writeFileSync(value("--export")!, JSON.stringify(rows, null, 2));
    console.log(`Exported ${rows.length} posts.`);
    return;
  }
  if (value("--import")) {
    const items = JSON.parse(fs.readFileSync(value("--import")!, "utf8")) as { x_id: string; topic?: string; subtopic?: string | null; content_type?: string; hook_type?: string; is_news?: boolean; source?: "manual" | "ai"; note?: string }[];
    const find = db.prepare("SELECT id, class_source FROM posts WHERE x_id = ?");
    let done = 0, skipped = 0;
    for (const it of items) {
      const row = find.get(String(it.x_id)) as { id: number; class_source: string | null } | undefined;
      if (!row || (row.class_source === "manual" && !flag("--force"))) { skipped++; continue; }
      saveClassification(row.id, it, it.source ?? "ai", it.note ?? null);
      done++;
    }
    console.log(`Imported tags for ${done} post(s); skipped ${skipped} (unknown id or manually tagged).`);
    return;
  }
  if (flag("--ai")) {
    if (!aiAvailable()) {
      console.log("ANTHROPIC_API_KEY is not set - AI classification is unavailable. Rule-based tags remain in place.");
      return;
    }
    const where = flag("--all") ? "class_source IS NULL OR class_source != 'manual'" : "class_source IS NULL OR class_source = 'rule'";
    const posts = db.prepare(`SELECT id, text FROM posts WHERE kind IN ('post','quote') AND (${where}) ORDER BY created_at DESC`).all() as { id: number; text: string }[];
    if (!posts.length) { console.log("Nothing to classify."); return; }
    console.log(`Classifying ${posts.length} post(s) with ${aiModel()}...`);
    const result = await classifyWithAI(posts);
    for (const [id, c] of result) saveClassification(id, c, "ai", aiModel());
    console.log(`AI tags saved for ${result.size} post(s).`);
    return;
  }
  postProcess();
  const counts = db.prepare("SELECT COALESCE(class_source,'none') AS source, COUNT(*) AS n FROM posts WHERE kind IN ('post','quote') GROUP BY 1").all();
  console.log("Rule-based tags refreshed. Tag sources:", counts);
}
main().catch((e) => { console.error(`Classification failed: ${e instanceof Error ? e.message : e}`); process.exit(1); });
