import type { PostRow } from "../db";

/** A post as used by every analysis and by the UI (no raw API payload). */
export interface Post extends Omit<PostRow, "media_types" | "external_urls"> {
  mediaTypes: string[];
  externalUrls: string[];
  /** Calendar fields in the account timezone. */
  localDate: string;
  localTime: string;
  hour: number;
  dow: number;
  dowName: string;
  bucket: string;
  weekKey: string;
  /** Public interactions: likes + replies + reposts + quotes + bookmarks. */
  engagements: number | null;
  /** Age of the post when its metrics were last refreshed, in hours. */
  ageHours: number;
  /** Younger than 48h at the last sync: numbers are still moving. */
  maturing: boolean;
  /** True for the account's own content (posts and quote posts); replies and reposts are excluded from analysis. */
  isOriginal: boolean;
  score: PostScore | null;
}

export type OutlierKind = "far_above" | "above" | "below";

export interface ScoreComponent {
  key: string;
  label: string;
  value: number;
  percentile: number;
  referenceMedian: number | null;
}

export interface PostScore {
  /** Which posts this one was compared with. */
  referenceKind: "trailing-90d" | "all-time";
  referenceN: number;
  expectedMedian: number;
  expectedLow: number; // 25th percentile of the reference set
  expectedHigh: number; // 75th percentile
  /** Percentile (0-100) of impressions within the reference set. */
  distribution: number;
  /** Mean percentile (0-100) of the available per-impression rates; null if no rate could be compared. */
  quality: number | null;
  qualityComponents: ScoreComponent[];
  /** actual / expected median - 1 */
  lift: number;
  /** Robust z-score of log10(impressions) (median / MAD). */
  robustZ: number | null;
  outlier: OutlierKind | null;
  /** Fewer than 200 impressions: per-impression rates are noisy. */
  lowConfidence: boolean;
  diagnosis: string;
}

export interface Summary {
  n: number;
  totalImpressions: number | null;
  avgImpressions: number | null;
  medianImpressions: number | null;
  totalEngagements: number | null;
  totalLikes: number | null;
  totalReplies: number | null;
  totalReposts: number | null;
  totalQuotes: number | null;
  totalBookmarks: number | null;
  totalProfileVisits: number | null;
  /** Total engagements / total impressions. */
  pooledEngagementRate: number | null;
  avgEngagementRate: number | null;
  medianEngagementRate: number | null;
  avgLikeRate: number | null;
  medianLikeRate: number | null;
  avgReplyRate: number | null;
  medianReplyRate: number | null;
  avgRepostRate: number | null;
  medianRepostRate: number | null;
  avgBookmarkRate: number | null;
  medianBookmarkRate: number | null;
  avgProfileVisitRate: number | null;
  medianProfileVisitRate: number | null;
  /** How many posts in the set have private metrics (profile visits). */
  nWithPrivate: number;
}

export interface GroupRow {
  key: string;
  n: number;
  lowSample: boolean;
  totalImpressions: number | null;
  medianImpressions: number | null;
  avgImpressions: number | null;
  medianEngagementRate: number | null;
  medianLikeRate: number | null;
  medianBookmarkRate: number | null;
  medianRepostRate: number | null;
  medianReplyRate: number | null;
  medianProfileVisitRate: number | null;
  medianDistribution: number | null;
  medianQuality: number | null;
  postIds: number[];
}

/** Below this many posts a group is flagged as "low sample" and never used for conclusions. */
export const MIN_SAMPLE = 3;
/** Posts younger than this at the last sync are flagged as still accumulating. */
export const MATURITY_HOURS = 48;
