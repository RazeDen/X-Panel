import type { MetricValues, PostKind } from "../db";

/* Raw shapes: only the parts of the API payload this project reads. */
export interface RawUrl { expanded_url?: string; url?: string; media_key?: string; display_url?: string }
export interface RawTweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
  lang?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: { type: "quoted" | "replied_to" | "retweeted"; id: string }[];
  attachments?: { media_keys?: string[] };
  entities?: { urls?: RawUrl[] };
  note_tweet?: { text?: string; entities?: { urls?: RawUrl[] } };
  article?: { title?: string; plain_text?: string; preview_text?: string };
  public_metrics?: Record<string, number>;
  non_public_metrics?: Record<string, number>;
  organic_metrics?: Record<string, number>;
}
export interface RawMedia {
  media_key: string;
  type: string;
  duration_ms?: number;
  public_metrics?: Record<string, number>;
  non_public_metrics?: Record<string, number>;
  organic_metrics?: Record<string, number>;
}
export interface RawIncludes { media?: RawMedia[]; tweets?: RawTweet[] }

export interface MappedPost {
  x_id: string;
  url: string;
  text: string;
  short_text: string;
  article_title: string | null;
  created_at: string;
  kind: PostKind;
  is_self_reply: boolean;
  is_self_quote: boolean;
  quoted_is_article: boolean;
  referenced_id: string | null;
  conversation_id: string | null;
  in_reply_to_user_id: string | null;
  lang: string | null;
  has_media: boolean;
  has_link: boolean;
  media_types: string[];
  video_duration_ms: number | null;
  external_urls: string[];
  metrics: MetricValues;
  non_public_available: boolean;
  raw: RawTweet;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const firstNum = (...vs: unknown[]): number | null => {
  for (const v of vs) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
};

const INTERNAL_LINK = /^https?:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i;
const ARTICLE_LINK = /^https?:\/\/(www\.)?(x|twitter)\.com\/i\/article\//i;

export function mapTweet(t: RawTweet, includes: RawIncludes, me: { id: string; username: string }): MappedPost {
  const ref = t.referenced_tweets?.[0];
  const kind: PostKind = !ref ? "post" : ref.type === "retweeted" ? "repost" : ref.type === "replied_to" ? "reply" : "quote";

  const mediaKeys = t.attachments?.media_keys ?? [];
  const media = mediaKeys.map((k) => includes.media?.find((m) => m.media_key === k)).filter((m): m is RawMedia => !!m);
  const mediaTypes = [...new Set(media.map((m) => m.type))];
  const videos = media.filter((m) => m.type === "video");

  const urls = [...(t.entities?.urls ?? []), ...(t.note_tweet?.entities?.urls ?? [])];
  // A self-quote is recognisable without fetching the quoted post: its URL carries our own handle.
  const selfQuote = !!ref && ref.type === "quoted" && urls.some((u) => {
    const m = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/i.exec(u.expanded_url ?? "");
    return !!m && m[2] === ref.id && m[1].toLowerCase() === me.username.toLowerCase();
  });
  const external = [...new Set(urls
    .filter((u) => !u.media_key && u.expanded_url)
    .map((u) => u.expanded_url as string)
    .filter((u) => !INTERNAL_LINK.test(u) && !ARTICLE_LINK.test(u) && !/^https?:\/\/pic\.(x|twitter)\.com/i.test(u)))];

  const article = t.article && (t.article.title || t.article.plain_text) ? t.article : null;
  const fullText = article
    ? [article.title, article.plain_text ?? article.preview_text].filter(Boolean).join("\n\n")
    : t.note_tweet?.text ?? t.text;

  const pm = t.public_metrics ?? {};
  const npm = t.non_public_metrics;
  const om = t.organic_metrics;
  const hasPrivate = !!npm || !!om;

  // Video counters are reported per media item; a post normally carries one video. Sum if there are several.
  const sumMedia = (pick: (m: RawMedia) => unknown): number | null => {
    const vals = videos.map((m) => num(pick(m))).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const playback = (q: string) => sumMedia((m) => m.non_public_metrics?.[`playback_${q}_count`] ?? m.organic_metrics?.[`playback_${q}_count`]);

  const metrics: MetricValues = {
    impressions: firstNum(pm.impression_count, npm?.impression_count),
    likes: num(pm.like_count),
    replies: num(pm.reply_count),
    reposts: num(pm.retweet_count),
    quotes: num(pm.quote_count),
    bookmarks: num(pm.bookmark_count),
    profile_visits: firstNum(npm?.user_profile_clicks, om?.user_profile_clicks),
    // X only includes url_link_clicks for posts that contain a clickable link; absent means "not reported", not 0.
    link_clicks: firstNum(npm?.url_link_clicks, om?.url_link_clicks),
    engagements_reported: num(npm?.engagements),
    organic_impressions: num(om?.impression_count),
    video_views: sumMedia((m) => m.public_metrics?.view_count ?? m.organic_metrics?.view_count),
    playback_0: playback("0"),
    playback_25: playback("25"),
    playback_50: playback("50"),
    playback_75: playback("75"),
    playback_100: playback("100"),
  };
  // A repost's own counters describe the original post, not this account's repost: keep only what X attributes to it.
  if (kind === "repost") {
    metrics.likes = metrics.replies = metrics.reposts = metrics.quotes = metrics.bookmarks = null;
    metrics.impressions = null;
  }

  return {
    x_id: t.id,
    url: `https://x.com/${me.username}/status/${t.id}`,
    text: fullText,
    short_text: t.text,
    article_title: article?.title ?? null,
    created_at: new Date(t.created_at).toISOString(),
    kind,
    is_self_reply: kind === "reply" && t.in_reply_to_user_id === me.id,
    is_self_quote: selfQuote,
    quoted_is_article: false, // resolved after the write, from our own stored posts
    referenced_id: ref?.id ?? null,
    conversation_id: t.conversation_id ?? null,
    in_reply_to_user_id: t.in_reply_to_user_id ?? null,
    lang: t.lang ?? null,
    has_media: mediaKeys.length > 0,
    has_link: external.length > 0,
    media_types: mediaTypes,
    video_duration_ms: videos.length ? num(videos[0].duration_ms) : null,
    external_urls: external,
    metrics,
    non_public_available: hasPrivate,
    raw: t,
  };
}
