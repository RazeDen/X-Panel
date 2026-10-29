import { getDb, getMeta, setMeta } from "../db";
import { redact } from "../env";
import { mentionsPage, twitterApiKey, type TwitterApiTweet } from "./twitterapi";

/**
 * Reads new comments (replies by other accounts to the owner's posts and replies) from twitterapi.io.
 *
 * Cost control: twitterapi.io bills every request (at least $0.00015, even when empty) plus $0.00015
 * per returned tweet. So a fetch only happens when the reply counts of the owner's recent posts
 * changed since the last fetch (those come free with the normal post sync), or once an hour as a
 * fallback for replies deeper in a thread, and it asks only for mentions newer than the last fetch.
 */
const FIRST_FETCH_DAYS = 7;
const FALLBACK_MINUTES = 60;
const OVERLAP_SECONDS = 120;
const MAX_PAGES = 10;

export interface CommentSyncResult {
  requests: number;
  fetched: number;
  inserted: number;
  updated: number;
}

/** Sum of reply counts on the owner's posts from the last 14 days: changes when someone comments. */
function replySum(now: Date): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(replies), 0) AS n FROM posts WHERE created_at >= ?")
    .get(new Date(now.getTime() - 14 * 86400000).toISOString()) as { n: number };
  return r.n;
}

/** Whether a fetch is worth a request now. Never true without a twitterapi.io key. */
export function commentsDue(now: Date = new Date()): { due: boolean; reason: string } {
  if (!twitterApiKey()) return { due: false, reason: "no TWITTERAPI_IO_KEY" };
  const last = getMeta("comments_last_fetch");
  if (!last) return { due: true, reason: "first fetch" };
  if (String(replySum(now)) !== getMeta("comments_reply_sum")) return { due: true, reason: "reply counts changed" };
  const minutes = (now.getTime() - Date.parse(last)) / 60000;
  if (minutes >= FALLBACK_MINUTES) return { due: true, reason: `${Math.round(minutes)} min since the last fetch` };
  return { due: false, reason: "no new replies" };
}

/** Strips the leading "@razeden0 @other" reply mentions X puts in front of every reply. */
export function stripReplyMentions(text: string): string {
  return text.replace(/^(?:@\w+\s+)+/, "").trim() || text.trim();
}

export async function syncComments(opts: { now?: Date; log?: (m: string) => void } = {}): Promise<CommentSyncResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const db = getDb();
  const userName = getMeta("account_username");
  const ownerId = getMeta("account_id");
  if (!userName || !ownerId) throw new Error("Run a normal sync first: the account is not known yet.");

  const last = getMeta("comments_last_fetch");
  const since = Math.floor((last ? Date.parse(last) / 1000 - OVERLAP_SECONDS : now.getTime() / 1000 - FIRST_FETCH_DAYS * 86400));
  const sum = replySum(now);
  const result: CommentSyncResult = { requests: 0, fetched: 0, inserted: 0, updated: 0 };
  const replies: TwitterApiTweet[] = [];
  try {
    let cursor = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const p = await mentionsPage(userName, since, cursor);
      result.requests++;
      const tweets = p.tweets ?? [];
      result.fetched += tweets.length;
      // Only replies to the owner by someone else; plain mentions and the owner's own tweets are skipped.
      replies.push(...tweets.filter((t) => t.author?.id !== ownerId && (t.inReplyToUserId === ownerId || t.inReplyToUsername?.toLowerCase() === userName.toLowerCase())));
      const oldest = tweets.length ? Date.parse(tweets[tweets.length - 1].createdAt ?? "") / 1000 : 0;
      if (!tweets.length || !p.has_next_page || !p.next_cursor || oldest < since) break;
      cursor = p.next_cursor;
    }
  } catch (err) {
    setMeta("comments_last_error", `${now.toISOString()} ${redact(err instanceof Error ? err.message : String(err))}`);
    throw err;
  }

  const seen = now.toISOString();
  const insert = db.prepare(`INSERT INTO comments (id, url, text, created_at, first_seen_at, last_seen_at, in_reply_to_id, conversation_id,
      author_id, author_username, author_name, author_avatar, like_count, reply_count)
    VALUES (@id, @url, @text, @created_at, @seen, @seen, @in_reply_to_id, @conversation_id, @author_id, @author_username, @author_name, @author_avatar, @like_count, @reply_count)
    ON CONFLICT(id) DO UPDATE SET text = excluded.text, last_seen_at = excluded.last_seen_at, author_username = excluded.author_username,
      author_name = excluded.author_name, author_avatar = excluded.author_avatar, like_count = excluded.like_count, reply_count = excluded.reply_count`);
  const exists = db.prepare("SELECT 1 FROM comments WHERE id = ?");
  db.transaction(() => {
    for (const t of replies) {
      const created = Date.parse(t.createdAt ?? "");
      if (!t.id || Number.isNaN(created)) continue;
      const known = !!exists.get(t.id);
      insert.run({
        id: t.id, seen,
        url: t.url || `https://x.com/${t.author?.userName ?? "i"}/status/${t.id}`,
        text: t.text ?? "",
        created_at: new Date(created).toISOString(),
        in_reply_to_id: t.inReplyToId || null, conversation_id: t.conversationId || null,
        author_id: t.author?.id ?? null, author_username: t.author?.userName ?? null, author_name: t.author?.name ?? null,
        author_avatar: t.author?.profilePicture ?? null,
        like_count: typeof t.likeCount === "number" ? t.likeCount : null, reply_count: typeof t.replyCount === "number" ? t.replyCount : null,
      });
      if (known) result.updated++;
      else result.inserted++;
    }
    setMeta("comments_last_fetch", seen);
    setMeta("comments_reply_sum", String(sum));
    setMeta("comments_last_error", null);
  })();
  log(`comments: ${result.requests} request(s), ${result.fetched} mentions, ${result.inserted} new, ${result.updated} updated`);
  return result;
}
