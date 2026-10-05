import type { Classification } from "./taxonomy";

/**
 * Rule-based classifier: transparent keyword heuristics, used when no manual or AI
 * tag exists. It is deliberately simple and is expected to be wrong sometimes -
 * every tag it writes is stored with source = "rule" and can be edited in the UI.
 */
interface Rule {
  value: string;
  patterns: RegExp[];
  weight?: number;
}

const TOPIC_RULES: Rule[] = [
  { value: "Claude", patterns: [/\bclaude\b/i, /\banthropic\b/i, /\bopus\b/i, /\bsonnet\b/i, /\bhaiku\b/i, /\bclaude code\b/i] },
  { value: "OpenAI", patterns: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt[- ]?\d/i, /\bsora\b/i, /\bcodex\b/i, /\bsam altman\b/i] },
  { value: "Grok / xAI", patterns: [/\bgrok\b/i, /\bxai\b/i] },
  { value: "Google / Gemini", patterns: [/\bgemini\b/i, /\bdeepmind\b/i, /\bveo\b/i, /\bnano banana\b/i] },
  { value: "AI Agents", patterns: [/\bagents?\b/i, /\bagentic\b/i, /\bautonomous\b/i, /\bmcp\b/i, /\bsubagents?\b/i] },
  { value: "Motion Design", patterns: [/\bmotion (design|designer|graphics)\b/i, /\banimat(ed|ion|ions|e)\b/i, /\bafter effects\b/i, /\bremotion\b/i] },
  { value: "Coding", patterns: [/\bcod(e|ing)\b/i, /\brepos?\b/i, /\bgithub\b/i, /\bdevelopers?\b/i, /\bprogramm/i, /\bported\b/i, /\bvibe[- ]cod/i] },
  { value: "AI Research", patterns: [/\bpaper\b/i, /\bbenchmark/i, /\bresearch(ers)?\b/i, /\bstudy\b/i, /\barxiv\b/i] },
  { value: "Money", patterns: [/\$\s?\d/, /\brevenue\b/i, /\bincome\b/i, /\bmrr\b/i, /\bsalary\b/i, /\bprofit\b/i, /\bper (day|month|year)\b/i, /\bbet\b/i] },
  { value: "AI Tools", patterns: [/\btools?\b/i, /\bprompts?\b/i, /\bworkflow\b/i, /\bautomation\b/i, /\bplugin\b/i, /\bskills?\b/i] },
  { value: "X / Twitter", patterns: [/\btwitter\b/i, /\bon x\b/i, /\bx algorithm\b/i, /\bimpressions\b/i, /\bfollowers\b/i] },
];

const SUBTOPIC_RULES: Rule[] = [
  { value: "Opus", patterns: [/\bopus\b/i] },
  { value: "Sonnet", patterns: [/\bsonnet\b/i] },
  { value: "Claude Code", patterns: [/\bclaude code\b/i] },
  { value: "Grok", patterns: [/\bgrok\b/i] },
  { value: "ChatGPT", patterns: [/\bchatgpt\b/i, /\bgpt[- ]?\d/i] },
  { value: "Agents", patterns: [/\bagents?\b/i] },
  { value: "Motion design", patterns: [/\bmotion\b/i, /\banimat/i] },
  { value: "Prompts", patterns: [/\bprompts?\b/i] },
  { value: "Repos", patterns: [/\brepos?\b/i, /\bgithub\b/i] },
];

const CONTENT_RULES: Rule[] = [
  { value: "Tutorial", patterns: [/\bhow to\b/i, /\bstep[- ]by[- ]step\b/i, /\b\d+ steps\b/i, /\btutorial\b/i, /\bhere'?s how\b/i], weight: 3 },
  { value: "Guide", patterns: [/\bguide\b/i, /\bplaybook\b/i, /\bcheat ?sheet\b/i, /\bexact (steps|setup|prompt)/i], weight: 2 },
  { value: "Resource", patterns: [/\b\d+\s+(repos|tools|prompts|skills|resources|plugins|files)\b/i, /\bsend this prompt\b/i, /\bcopy (this|the) prompt\b/i], weight: 3 },
  { value: "News", patterns: [/\bjust (shipped|launched|released|dropped|announced)\b/i, /\bbreaking\b/i, /\bleaked?\b/i, /\bis (now )?(out|live)\b/i], weight: 2 },
  { value: "Case Study", patterns: [/\b(made|makes|earned|generat\w+) \$?\d/i, /\bfor \$\d/i, /\bin \d+(\.\d+)? (seconds|minutes|hours|days)\b/i, /\ba builder\b/i], weight: 2 },
  { value: "Experiment", patterns: [/\bi (tested|tried|ran)\b/i, /\bsimulated\b/i, /\bexperiment\b/i, /\bran \d+/i], weight: 2 },
  { value: "Showcase", patterns: [/\bi (built|made|created)\b/i, /\bcreated by claude\b/i, /\bone prompt\b/i, /\bmade (this|it) (with|in)\b/i], weight: 2 },
  { value: "Comparison", patterns: [/\bvs\.?\b/i, /\bversus\b/i, /\bcompared (to|with)\b/i, /\bbeats?\b/i], weight: 2 },
  { value: "Prediction", patterns: [/\bwill (be|replace|kill|change)\b/i, /\bby 20\d\d\b/i, /\bprediction\b/i, /\bare cooked\b/i], weight: 2 },
  { value: "Story", patterns: [/\bmy friend\b/i, /\b(she|he) (made|told|said)\b/i, /\blast (week|night|month)\b/i, /\byears? ago\b/i], weight: 2 },
  { value: "Announcement", patterns: [/\bi'?m (launching|releasing|opening)\b/i, /\bannouncing\b/i, /\bnow available\b/i], weight: 2 },
  { value: "Opinion", patterns: [/\bi think\b/i, /\bunpopular opinion\b/i, /\bhot take\b/i, /\bfeel(s)? unfair\b/i, /\bscared me\b/i], weight: 1 },
];

/** Hook rules look only at the opening line - that is what the reader sees first. */
const HOOK_RULES: Rule[] = [
  { value: "Leak", patterns: [/\bleak(ed|s)?\b/i], weight: 5 },
  { value: "Breaking", patterns: [/\bbreaking\b/i, /\bjust (shipped|launched|released|dropped|announced|made)\b/i], weight: 4 },
  { value: "How-to", patterns: [/\bhow to\b/i, /\bhow i\b/i, /\bhere'?s how\b/i], weight: 4 },
  { value: "Question", patterns: [/\?\s*$/, /^(why|what|how|who|is|are|can|do|does)\b.*\?/i], weight: 4 },
  { value: "Contrarian", patterns: [/\bwrong\b/i, /\bstop (using|doing)\b/i, /\bis dead\b/i, /\bnobody (is|talks)\b/i, /\beveryone (thinks|is)\b/i], weight: 3 },
  { value: "Comparison", patterns: [/\bvs\.?\b/i, /\bversus\b/i], weight: 3 },
  { value: "Curiosity", patterns: [/\bpromise not to\b/i, /\bsecret\b/i, /\byou won'?t believe\b/i, /\bthis is (the|how|why)\b/i, /\bscared me\b/i, /\bfeel(s)? unfair\b/i], weight: 3 },
  { value: "Result", patterns: [/\$\s?\d/, /\b\d[\d,.]*\s?(k|m|%|x)\b/i, /\bin \d+(\.\d+)? (seconds|minutes|hours|days)\b/i], weight: 2 },
  { value: "Personal experience", patterns: [/^(i|my|we)\b/i], weight: 2 },
  { value: "Number", patterns: [/^\d+\b/, /\b\d[\d,.]*\b/], weight: 1 },
  { value: "Announcement", patterns: [/\bannouncing\b/i, /\bintroducing\b/i, /\bnow (live|available)\b/i], weight: 3 },
  { value: "Strong claim", patterns: [/\b(best|worst|most|never|always|every|only)\b/i, /\bturns\b/i, /\bunfair\b/i], weight: 1 },
];

function best(rules: Rule[], text: string): { value: string; score: number }[] {
  return rules
    .map((r) => ({ value: r.value, score: r.patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0) * (r.weight ?? 1) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function firstLine(text: string): string {
  const cleaned = text.replace(/https?:\/\/\S+/g, "").trim();
  return (cleaned.split(/\n+/)[0] ?? "").trim();
}

export function classifyByRules(text: string, articleTitle?: string | null): Classification {
  const body = text.replace(/https?:\/\/\S+/g, " ");
  const hookText = articleTitle?.trim() || firstLine(text);
  // Topics: the opening line counts double - it is the declared subject of the post.
  const topicScores = new Map<string, number>();
  for (const t of best(TOPIC_RULES, body)) topicScores.set(t.value, t.score);
  for (const t of best(TOPIC_RULES, hookText)) topicScores.set(t.value, (topicScores.get(t.value) ?? 0) + t.score * 2);
  const topics = [...topicScores.entries()].sort((a, b) => b[1] - a[1]);
  const topic = topics[0]?.[0] ?? (body.trim().length ? "Other" : null);
  const subtopic = best(SUBTOPIC_RULES, hookText)[0]?.value ?? best(SUBTOPIC_RULES, body)[0]?.value ?? null;
  const content = best(CONTENT_RULES, body)[0]?.value ?? null;
  const hook = best(HOOK_RULES, hookText)[0]?.value ?? null;
  const isNews = content === "News" || hook === "Breaking" || hook === "Leak";
  return { topic, subtopic, content_type: content, hook_type: hook, is_news: body.trim().length ? isNews : null };
}

/** Format is a structural fact derived from what the post contains, not from its wording. */
export function deriveFormat(p: {
  article: boolean;
  isThreadRoot: boolean;
  mediaTypes: string[];
  hasLink: boolean;
}): string {
  if (p.article) return "Article";
  if (p.isThreadRoot) return "Thread";
  const kinds = new Set(p.mediaTypes);
  if (kinds.size > 1) return "Mixed media";
  if (kinds.has("video")) return "Video";
  if (kinds.has("animated_gif")) return "GIF";
  if (kinds.has("photo")) return "Image";
  if (p.hasLink) return "Link";
  return "Text";
}
