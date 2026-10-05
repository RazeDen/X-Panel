import { mean, median, ratio, sum } from "../stats";
import type { GroupRow, Post, Summary } from "./types";
import { MIN_SAMPLE } from "./types";

export function summarize(posts: Post[]): Summary {
  const imp = posts.map((p) => p.impressions);
  const totalImpressions = sum(imp);
  const totalEngagements = sum(posts.map((p) => p.engagements));
  return {
    n: posts.length,
    totalImpressions,
    avgImpressions: mean(imp),
    medianImpressions: median(imp),
    totalEngagements,
    totalLikes: sum(posts.map((p) => p.likes)),
    totalReplies: sum(posts.map((p) => p.replies)),
    totalReposts: sum(posts.map((p) => p.reposts)),
    totalQuotes: sum(posts.map((p) => p.quotes)),
    totalBookmarks: sum(posts.map((p) => p.bookmarks)),
    totalProfileVisits: sum(posts.map((p) => p.profile_visits)),
    pooledEngagementRate: ratio(totalEngagements, totalImpressions),
    avgEngagementRate: mean(posts.map((p) => p.engagement_rate)),
    medianEngagementRate: median(posts.map((p) => p.engagement_rate)),
    avgLikeRate: mean(posts.map((p) => p.like_rate)),
    medianLikeRate: median(posts.map((p) => p.like_rate)),
    avgReplyRate: mean(posts.map((p) => p.reply_rate)),
    medianReplyRate: median(posts.map((p) => p.reply_rate)),
    avgRepostRate: mean(posts.map((p) => p.repost_rate)),
    medianRepostRate: median(posts.map((p) => p.repost_rate)),
    avgBookmarkRate: mean(posts.map((p) => p.bookmark_rate)),
    medianBookmarkRate: median(posts.map((p) => p.bookmark_rate)),
    avgProfileVisitRate: mean(posts.map((p) => p.profile_visit_rate)),
    medianProfileVisitRate: median(posts.map((p) => p.profile_visit_rate)),
    nWithPrivate: posts.filter((p) => p.profile_visits !== null).length,
  };
}

export function groupPosts(posts: Post[], keyOf: (p: Post) => string | null | undefined, order?: string[]): GroupRow[] {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    const key = keyOf(p) || "Untagged";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const rows: GroupRow[] = [...map.entries()].map(([key, ps]) => ({
    key,
    n: ps.length,
    lowSample: ps.length < MIN_SAMPLE,
    totalImpressions: sum(ps.map((p) => p.impressions)),
    medianImpressions: median(ps.map((p) => p.impressions)),
    avgImpressions: mean(ps.map((p) => p.impressions)),
    medianEngagementRate: median(ps.map((p) => p.engagement_rate)),
    medianLikeRate: median(ps.map((p) => p.like_rate)),
    medianBookmarkRate: median(ps.map((p) => p.bookmark_rate)),
    medianRepostRate: median(ps.map((p) => p.repost_rate)),
    medianReplyRate: median(ps.map((p) => p.reply_rate)),
    medianProfileVisitRate: median(ps.map((p) => p.profile_visit_rate)),
    medianDistribution: median(ps.map((p) => p.score?.distribution)),
    medianQuality: median(ps.map((p) => p.score?.quality)),
    postIds: ps.map((p) => p.id),
  }));
  if (order) {
    const idx = new Map(order.map((k, i) => [k, i]));
    return rows.sort((a, b) => (idx.get(a.key) ?? 999) - (idx.get(b.key) ?? 999));
  }
  return rows.sort((a, b) => (b.medianImpressions ?? -1) - (a.medianImpressions ?? -1));
}

export const dimensionValue = (p: Post, dim: string): string | null => {
  switch (dim) {
    case "topic": return p.topic;
    case "subtopic": return p.subtopic;
    case "content_type": return p.content_type;
    case "hook_type": return p.hook_type;
    case "format": return p.format;
    case "bucket": return p.bucket;
    case "dow": return p.dowName;
    case "hour": return String(p.hour).padStart(2, "0") + ":00";
    case "news": return p.is_news === null ? null : p.is_news ? "News-related" : "Not news";
    default: return null;
  }
};
