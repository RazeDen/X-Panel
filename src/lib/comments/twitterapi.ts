import { redact } from "../env";

/**
 * Minimal twitterapi.io client: comments for every account, and posts / profile of the extra accounts
 * (server-side only, never import from a client component). Pricing (2026-10): $0.15 per 1,000 tweets
 * returned (author profiles included), $0.18 per 1,000 profiles, and at least $0.00015 per request
 * even when it returns nothing - so callers only ask when something can be new. Re-reads are billed
 * again (no daily de-duplication like the X API).
 */
export interface TwitterApiUser {
  id?: string;
  userName?: string;
  name?: string;
  profilePicture?: string;
}
export interface TwitterApiMedia {
  type?: string;
  media_url_https?: string;
  video_info?: { duration_millis?: number };
}
export interface TwitterApiTweet {
  id: string;
  type?: string;
  viewCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  lang?: string;
  entities?: { urls?: { expanded_url?: string; url?: string }[]; media?: TwitterApiMedia[] };
  extendedEntities?: { media?: TwitterApiMedia[] };
  extended_entities?: { media?: TwitterApiMedia[] };
  /** X Article (long-form post): title, start of the text and cover image. */
  article?: { title?: string; preview_text?: string; cover_media_img_url?: string } | null;
  quoted_tweet?: TwitterApiTweet | null;
  retweeted_tweet?: TwitterApiTweet | null;
  url?: string;
  text?: string;
  createdAt?: string;
  isReply?: boolean;
  inReplyToId?: string | null;
  inReplyToUserId?: string | null;
  inReplyToUsername?: string | null;
  conversationId?: string | null;
  likeCount?: number;
  replyCount?: number;
  author?: TwitterApiUser;
}
interface MentionsPage {
  tweets?: TwitterApiTweet[];
  has_next_page?: boolean;
  next_cursor?: string;
  status?: string;
  msg?: string;
}

export class TwitterApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "TwitterApiError";
  }
}

export function twitterApiKey(): string | null {
  return process.env.TWITTERAPI_IO_KEY?.trim() || null;
}

/** GET on the twitterapi.io API; throws TwitterApiError with a redacted message on any failure. */
export async function twitterApiGet<T extends { status?: string; msg?: string }>(path: string, params: Record<string, string>): Promise<T> {
  const key = twitterApiKey();
  if (!key) throw new TwitterApiError("TWITTERAPI_IO_KEY is not set in .env");
  const base = (process.env.TWITTERAPI_IO_BASE || "https://api.twitterapi.io").replace(/\/$/, "");
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new TwitterApiError(`Could not reach twitterapi.io (${redact(err instanceof Error ? err.message : String(err))})`);
  }
  const body = await res.text();
  let j = {} as T & { message?: string };
  try {
    j = JSON.parse(body);
  } catch {
    /* not JSON: reported below */
  }
  if (res.status === 401 || res.status === 403) throw new TwitterApiError(`twitterapi.io rejected the key (${res.status}). Check TWITTERAPI_IO_KEY in .env.`, res.status);
  if (res.status !== 200 || j.status === "error") {
    throw new TwitterApiError(`twitterapi.io error ${res.status}: ${redact(String(j.msg || j.message || body.slice(0, 200)))}`, res.status);
  }
  return j;
}

/** One page (up to 20) of tweets mentioning the user, newest first. Replies to the user count as mentions. */
export function mentionsPage(userName: string, sinceTime: number, cursor: string): Promise<MentionsPage> {
  return twitterApiGet<MentionsPage>("/twitter/user/mentions", { userName, sinceTime: String(sinceTime), cursor });
}
