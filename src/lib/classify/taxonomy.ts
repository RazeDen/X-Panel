/**
 * Default vocabularies. They are suggestions, not constraints: every tag is free
 * text in the database, and the UI offers these plus whatever values already exist.
 */
export const DEFAULT_TOPICS = [
  "Claude", "OpenAI", "Grok / xAI", "Google / Gemini", "AI Agents", "Coding", "AI Research", "AI Tools",
  "Motion Design", "Money", "X / Twitter", "Other",
];
export const DEFAULT_CONTENT_TYPES = [
  "News", "Tutorial", "Opinion", "Showcase", "Case Study", "Prediction", "Guide", "Story",
  "Announcement", "Comparison", "Resource", "Experiment",
];
export const DEFAULT_HOOK_TYPES = [
  "Number", "Result", "How-to", "Curiosity", "Breaking", "Strong claim", "Question", "Contrarian",
  "Leak", "Comparison", "Personal experience", "Announcement",
];
export const DEFAULT_FORMATS = ["Text", "Image", "Video", "GIF", "Article", "Thread", "Link", "Mixed media"];

export type Dimension = "series" | "topic" | "subtopic" | "content_type" | "hook_type" | "format";
export const DIMENSIONS: { key: Dimension; label: string; plural: string }[] = [
  { key: "series", label: "Series", plural: "Series" },
  { key: "topic", label: "Topic", plural: "Topics" },
  { key: "subtopic", label: "Subtopic", plural: "Subtopics" },
  { key: "format", label: "Format", plural: "Formats" },
  { key: "content_type", label: "Content type", plural: "Content types" },
  { key: "hook_type", label: "Hook", plural: "Hooks" },
];
export const UNTAGGED = "Untagged";

export interface Classification {
  topic: string | null;
  subtopic: string | null;
  content_type: string | null;
  hook_type: string | null;
  is_news: boolean | null;
}
