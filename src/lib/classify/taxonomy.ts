/**
 * Grouping dimensions shown on the Content page. Topic, content type and hook were removed at the
 * owner's request (2026-10-07): they are no longer derived, shown or counted anywhere. Their old
 * values stay in the posts table, unused.
 */
export const DEFAULT_FORMATS = ["Text", "Image", "Video", "GIF", "Article", "Thread", "Link", "Mixed media"];

export type Dimension = "series" | "bait";
export const DIMENSIONS: { key: Dimension; label: string; plural: string }[] = [
  { key: "series", label: "Format", plural: "Formats" },
  { key: "bait", label: "Bait", plural: "Bait vs no bait" },
];
export const UNTAGGED = "Untagged";
