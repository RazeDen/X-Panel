import type { MetricValues, RateValues } from "./db";
import { ratio } from "./stats";

/**
 * Derived rates. Every rate is "per impression".
 *
 *   engagement_rate = (likes + replies + reposts + quotes + bookmarks) / impressions
 *
 * Only public interactions are counted so the rate is comparable across all posts,
 * including ones for which X no longer returns private metrics. A rate is NULL when
 * impressions are missing or zero, or when its numerator is unavailable.
 */
export function publicEngagements(m: Pick<MetricValues, "likes" | "replies" | "reposts" | "quotes" | "bookmarks">): number | null {
  const parts = [m.likes, m.replies, m.reposts, m.quotes, m.bookmarks];
  if (parts.every((p) => p === null || p === undefined)) return null;
  // All five come from the same public_metrics object, so they are present together.
  return parts.reduce<number>((a, b) => a + (b ?? 0), 0);
}

export function computeRates(m: MetricValues): RateValues {
  const imp = m.impressions;
  return {
    like_rate: ratio(m.likes, imp),
    reply_rate: ratio(m.replies, imp),
    repost_rate: ratio(m.reposts, imp),
    quote_rate: ratio(m.quotes, imp),
    bookmark_rate: ratio(m.bookmarks, imp),
    engagement_rate: ratio(publicEngagements(m), imp),
    profile_visit_rate: ratio(m.profile_visits, imp),
    link_click_rate: ratio(m.link_clicks, imp),
    video_view_rate: ratio(m.video_views, imp),
    // Share of video starts that reached 100% of the clip.
    video_completion_rate: ratio(m.playback_100, m.playback_0),
  };
}
