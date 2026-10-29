import { redact } from "../env";

/**
 * Minimal twitterapi.io client for reading comments (server-side only, never import from a client
 * component). Pricing (2026-10): $0.15 per 1,000 tweets returned, author profiles included, and at
 * least $0.00015 per request even when it returns nothing - so callers only ask when something is new.
 */
export interface TwitterApiUser {
  id?: string;
  userName?: string;
  name?: string;
  profilePicture?: string;
}
export interface TwitterApiTweet {
  id: string;
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

/** One page (up to 20) of tweets mentioning the user, newest first. Replies to the user count as mentions. */
export async function mentionsPage(userName: string, sinceTime: number, cursor: string): Promise<MentionsPage> {
  const key = twitterApiKey();
  if (!key) throw new TwitterApiError("TWITTERAPI_IO_KEY is not set in .env");
  const base = (process.env.TWITTERAPI_IO_BASE || "https://api.twitterapi.io").replace(/\/$/, "");
  const url = `${base}/twitter/user/mentions?${new URLSearchParams({ userName, sinceTime: String(sinceTime), cursor })}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new TwitterApiError(`Could not reach twitterapi.io (${redact(err instanceof Error ? err.message : String(err))})`);
  }
  const body = await res.text();
  let j: MentionsPage & { message?: string } = {};
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
