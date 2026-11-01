/**
 * Rule-based derivations from a post's own content. Topic, subtopic, content type, hook and the
 * news flag were removed at the owner's request (2026-10-07), bait on 2026-10-29; none is derived any more.
 */

/**
 * Series: the owner's two main content lines (owner's definition, 2026-10-06).
 *  - "Animated file":  an animated post built around a file, config, prompt or rule set
 *                      ("ANTHROPIC DESIGNER LEAKED A 6-RULE FILE ...", "LEAKED HIS ROUTER CONFIG ...")
 *  - "Animated scene": an animation where something happens
 *                      ("CLAUDE ANIMATED JEV SORTING 3,412 LEADS", "AI MODELS SIMULATED A 5,000-PERSON COMPANY")
 *  - "Other":          everything else, including posts without video / GIF.
 * Only the headline's main clause (first line, up to the first " - ") is read, so a detail such as
 * "1 HTML FILE" later in the headline does not flip a scene into a file post. Rough by design:
 * the owner corrects mistakes on the post page and manual values are never overwritten.
 */
export const SERIES = ["Animated file", "Animated scene", "Other"] as const;
const FILE_WORDS = /\b(file|files|config|configs|prompt|prompts|rules?|rulebook|style guide|skill|repo|script)\b|\.md\b|\b\d+-(rule|line)\b/i;
const SCENE_WORDS = /\b(animat\w*|simulat\w*|sim|walks?|walking|sorting|sorts|clip|scene|frames?|spider|watch(es|ed)?|dies)\b/i;
export function deriveSeries(text: string, mediaTypes: string[]): string {
  if (!mediaTypes.some((t) => t === "video" || t === "animated_gif")) return "Other";
  const headline = (text.split("\n").find((l) => l.trim()) ?? "").split(/\s[-–—]\s/)[0];
  if (FILE_WORDS.test(headline)) return "Animated file";
  if (SCENE_WORDS.test(headline)) return "Animated scene";
  return "Other";
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
