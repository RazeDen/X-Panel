import { getDb, getMeta, type CommentRow } from "../db";
import { preview } from "../format";
import { formatDateTime } from "../time";
import { stripReplyMentions } from "./sync";

/**
 * Comments as the Comments page and the MCP tool show them. Status is derived, never stored:
 *  - answered: the owner's own reply to the comment is in posts (kind = 'reply', referenced_id = comment id);
 *  - hidden: the owner hid it (spam);
 *  - expired: not answered and older than COMMENT_MAX_AGE_HOURS - no longer worth answering (owner's choice), not shown;
 *  - open: everything else - the ones still waiting for an answer.
 */
export type CommentStatus = "open" | "answered" | "hidden" | "expired";
/** Unanswered comments older than this leave the To answer list (owner's request 2026-10-29). */
export const COMMENT_MAX_AGE_HOURS = 30;

export interface CommentPost {
  id: number;
  xId: string;
  url: string;
  text: string;
  isReply: boolean;
  /** Preview image of the post's first media item (X CDN), when it has one. */
  mediaPreview: string | null;
}

export interface CommentView {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  createdLabel: string;
  author: { username: string | null; name: string | null; avatar: string | null };
  likeCount: number | null;
  status: CommentStatus;
  hiddenAt: string | null;
  /** The owner's post (or reply) the comment answers, when it is stored; null for older threads. */
  parent: CommentPost | null;
  /** The thread's first post, when it differs from the parent. */
  root: CommentPost | null;
  /** The owner's answer, when there is one. */
  myReply: { text: string; url: string } | null;
}

interface PostLite { id: number; x_id: string; url: string; text: string; article_title: string | null; kind: string; media_preview: string | null }

export function listComments(status?: CommentStatus, now: Date = new Date()): CommentView[] {
  const db = getDb();
  const cutoff = new Date(now.getTime() - COMMENT_MAX_AGE_HOURS * 3600000).toISOString();
  const rows = db.prepare("SELECT * FROM comments ORDER BY created_at DESC").all() as CommentRow[];
  const post = db.prepare("SELECT id, x_id, url, text, article_title, kind, media_preview FROM posts WHERE x_id = ?");
  const reply = db.prepare("SELECT text, url FROM posts WHERE kind = 'reply' AND referenced_id = ? ORDER BY created_at LIMIT 1");
  const lite = (xId: string | null): CommentPost | null => {
    const p = xId ? (post.get(xId) as PostLite | undefined) : undefined;
    return p ? { id: p.id, xId: p.x_id, url: p.url, text: p.article_title || p.text, isReply: p.kind === "reply", mediaPreview: p.media_preview } : null;
  };
  const out: CommentView[] = [];
  for (const c of rows) {
    const mine = reply.get(c.id) as { text: string; url: string } | undefined;
    const s: CommentStatus = c.hidden_at ? "hidden" : mine ? "answered" : c.created_at < cutoff ? "expired" : "open";
    if (status && s !== status) continue;
    const parent = lite(c.in_reply_to_id);
    const root = c.conversation_id && c.conversation_id !== c.in_reply_to_id ? lite(c.conversation_id) : null;
    out.push({
      id: c.id, url: c.url, text: stripReplyMentions(c.text), createdAt: c.created_at, createdLabel: formatDateTime(c.created_at),
      author: { username: c.author_username, name: c.author_name, avatar: c.author_avatar },
      likeCount: c.like_count, status: s, hiddenAt: c.hidden_at, parent, root,
      myReply: mine ? { text: stripReplyMentions(mine.text), url: mine.url } : null,
    });
  }
  return out;
}

export function commentCounts(now: Date = new Date()): Record<CommentStatus, number> {
  const counts: Record<CommentStatus, number> = { open: 0, answered: 0, hidden: 0, expired: 0 };
  for (const c of listComments(undefined, now)) counts[c.status]++;
  return counts;
}

/** Hides a comment (spam) or brings it back. Nothing is deleted. */
export function setCommentHidden(id: string, hidden: boolean): boolean {
  const res = getDb().prepare(`UPDATE comments SET hidden_at = ${hidden ? "COALESCE(hidden_at, ?)" : "NULL"} WHERE id = ?`)
    .run(...(hidden ? [new Date().toISOString(), id] : [id]));
  return res.changes > 0;
}

export function commentsStatus(): { lastFetch: string | null; lastError: string | null } {
  return { lastFetch: getMeta("comments_last_fetch"), lastError: getMeta("comments_last_error") };
}

/** The owner's recent replies to other people: the style sample for drafts. */
function styleSamples(limit = 8): string[] {
  const rows = getDb().prepare("SELECT text FROM posts WHERE kind = 'reply' AND is_self_reply = 0 ORDER BY created_at DESC LIMIT ?").all(limit) as { text: string }[];
  return rows.map((r) => preview(stripReplyMentions(r.text), 240)).filter(Boolean);
}

/**
 * What "Draft in Claude" copies to the clipboard: the post, the owner's reply it is under (if any) and
 * the comment. The owner pastes it into a Claude chat of their own whose instructions set the voice and
 * the rules (owner's choice 2026-10-29), so drafting costs nothing and nothing is sent from here.
 */
export function draftMessage(c: CommentView): string {
  const root = c.root ?? (c.parent && !c.parent.isReply ? c.parent : null);
  const parts: string[] = [];
  parts.push(`Post:\n${root ? root.text.slice(0, 1500) : "(not available)"}`);
  if (c.parent?.isReply) parts.push(`My reply they answered:\n${stripReplyMentions(c.parent.text).slice(0, 600)}`);
  parts.push(`Comment by @${c.author.username ?? "someone"}:\n${c.text.slice(0, 1000)}`);
  return parts.join("\n\n");
}

export { styleSamples };
