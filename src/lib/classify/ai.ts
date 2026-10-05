import { DEFAULT_CONTENT_TYPES, DEFAULT_HOOK_TYPES, DEFAULT_TOPICS, type Classification } from "./taxonomy";
import { loadEnv, redact } from "../env";

/**
 * Optional AI classification through the Anthropic API.
 * Active only when ANTHROPIC_API_KEY is set; the rest of the project never depends on it.
 */
export function aiAvailable(): boolean {
  loadEnv();
  return !!process.env.ANTHROPIC_API_KEY;
}
export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
}

export async function anthropic(system: string, user: string, maxTokens = 1500): Promise<string> {
  loadEnv();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const body = JSON.stringify({ model: aiModel(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  const url = "https://api.anthropic.com/v1/messages";
  let res: { ok: boolean; status: number; text(): Promise<string> };
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const undici = await import("undici");
    res = await undici.fetch(url, { method: "POST", headers, body, dispatcher: new undici.EnvHttpProxyAgent() });
  } else {
    res = await fetch(url, { method: "POST", headers, body });
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${redact(text.slice(0, 300))}`);
  const j = JSON.parse(text) as { content?: { type: string; text?: string }[] };
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

const SYSTEM = `You tag posts from one X (Twitter) account so their performance can be compared.
Return ONLY a JSON array, one object per post, in the same order:
{"id": <id>, "topic": string, "subtopic": string|null, "content_type": string, "hook_type": string, "is_news": boolean}
- topic: the main subject. Prefer one of: ${DEFAULT_TOPICS.join(", ")}. Create a new short topic only if none fits.
- subtopic: a more specific subject (a product, model or theme), or null.
- content_type: one of ${DEFAULT_CONTENT_TYPES.join(", ")}.
- hook_type: how the FIRST line tries to earn attention. One of: ${DEFAULT_HOOK_TYPES.join(", ")}.
- is_news: true if the post is tied to a recent event or release.
Judge only from the text. Do not guess at performance.`;

export async function classifyWithAI(posts: { id: number; text: string }[]): Promise<Map<number, Classification>> {
  const out = new Map<number, Classification>();
  for (let i = 0; i < posts.length; i += 15) {
    const batch = posts.slice(i, i + 15);
    const user = batch.map((p) => `### id ${p.id}\n${p.text.slice(0, 1200)}`).join("\n\n");
    const raw = await anthropic(SYSTEM, user, 2500);
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) throw new Error("AI classification returned no JSON array");
    const arr = JSON.parse(raw.slice(start, end + 1)) as (Partial<Classification> & { id: number })[];
    for (const a of arr) {
      if (!batch.some((b) => b.id === a.id)) continue;
      out.set(a.id, {
        topic: a.topic?.trim() || null,
        subtopic: a.subtopic?.trim() || null,
        content_type: a.content_type?.trim() || null,
        hook_type: a.hook_type?.trim() || null,
        is_news: typeof a.is_news === "boolean" ? a.is_news : null,
      });
    }
  }
  return out;
}
