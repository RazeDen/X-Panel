import type { Post } from "./analytics/types";
import { preview } from "./format";

/** The subset of a post that tables and lists need on the client. */
export interface SlimPost {
  id: number;
  url: string;
  kind: string;
  localDate: string;
  localTime: string;
  dowName: string;
  preview: string;
  topic: string | null;
  format: string | null;
  hook: string | null;
  ctype: string | null;
  classSource: string | null;
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  bookmarks: number | null;
  profileVisits: number | null;
  engagementRate: number | null;
  likeRate: number | null;
  replyRate: number | null;
  repostRate: number | null;
  bookmarkRate: number | null;
  profileVisitRate: number | null;
  distribution: number | null;
  quality: number | null;
  outlier: string | null;
  maturing: boolean;
  createdAt: string;
}

export function slim(p: Post, max = 120): SlimPost {
  return {
    id: p.id, url: p.url, kind: p.kind, localDate: p.localDate, localTime: p.localTime, dowName: p.dowName,
    preview: preview(p.article_title || p.text, max),
    topic: p.topic, format: p.format, hook: p.hook_type, ctype: p.content_type, classSource: p.class_source,
    impressions: p.impressions, likes: p.likes, replies: p.replies, reposts: p.reposts, quotes: p.quotes, bookmarks: p.bookmarks,
    profileVisits: p.profile_visits, engagementRate: p.engagement_rate, likeRate: p.like_rate, replyRate: p.reply_rate,
    repostRate: p.repost_rate, bookmarkRate: p.bookmark_rate, profileVisitRate: p.profile_visit_rate,
    distribution: p.score?.distribution ?? null, quality: p.score?.quality ?? null, outlier: p.score?.outlier ?? null,
    maturing: p.maturing, createdAt: p.created_at,
  };
}
