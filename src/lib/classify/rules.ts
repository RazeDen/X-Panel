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

/**
 * Each account has its own set of formats (owner's request 2026-10-31):
 *  - scenes (main account): Animated file / Animated scene / Other, as above;
 *  - lectures (@Raytar): Animated file / Lectures / Other. "Lectures" = a video of at least
 *    LECTURE_MIN_MS (talks, courses, workshops run 7 min to 4 h; the account's animations stay under
 *    2 min); a shorter video with a file headline is "Animated file"; everything else "Other".
 */
export type SeriesScheme = "scenes" | "lectures";
export const SERIES_BY_SCHEME: Record<SeriesScheme, readonly string[]> = {
  scenes: SERIES,
  lectures: ["Animated file", "Lectures", "Other"],
};
/** Every format any account uses (MCP filter values). */
export const ALL_SERIES = ["Animated file", "Animated scene", "Lectures", "Other"] as const;
export const LECTURE_MIN_MS = 5 * 60000;
/** One-line description of a scheme's formats, for page and tool texts. */
export const SERIES_HELP: Record<SeriesScheme, string> = {
  scenes: "Animated file (an animated post built around a file, config, prompt or rule set), Animated scene (an animation where something happens) or Other",
  lectures: "Animated file (a short animated post built around a file, config, prompt or rule set), Lectures (a video of 5 minutes or more: a talk, course or workshop) or Other",
};
const FILE_WORDS = /\b(file|files|config|configs|prompt|prompts|rules?|rulebook|style guide|skill|repo|script)\b|\.md\b|\b\d+-(rule|line)\b/i;
const SCENE_WORDS = /\b(animat\w*|simulat\w*|sim|walks?|walking|sorting|sorts|clip|scene|frames?|spider|watch(es|ed)?|dies)\b/i;
export function deriveSeries(text: string, mediaTypes: string[], opts: { scheme?: SeriesScheme; videoMs?: number | null } = {}): string {
  if (!mediaTypes.some((t) => t === "video" || t === "animated_gif")) return "Other";
  const lectures = opts.scheme === "lectures";
  if (lectures && (opts.videoMs ?? 0) >= LECTURE_MIN_MS) return "Lectures";
  const headline = (text.split("\n").find((l) => l.trim()) ?? "").split(/\s[-–—]\s/)[0];
  if (FILE_WORDS.test(headline)) return "Animated file";
  if (!lectures && SCENE_WORDS.test(headline)) return "Animated scene";
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
