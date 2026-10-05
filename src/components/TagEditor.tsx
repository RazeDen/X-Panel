"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export interface TagValues { topic: string; subtopic: string; content_type: string; hook_type: string; format: string; is_news: boolean | null }
type Options = Record<"topic" | "subtopic" | "content_type" | "hook_type" | "format", string[]>;

const FIELDS: { key: keyof Options; label: string }[] = [
  { key: "topic", label: "Topic" },
  { key: "subtopic", label: "Subtopic" },
  { key: "content_type", label: "Content type" },
  { key: "hook_type", label: "Hook type" },
  { key: "format", label: "Format" },
];

/** Edit a post's tags. Any value can be typed - suggestions are existing and default tags. */
export function TagEditor({ postId, initial, options, source }: { postId: number; initial: TagValues; options: Options; source: string | null }) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState<TagValues>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function call(method: "PATCH" | "DELETE") {
    setState("saving");
    try {
      const res = await fetch(`/api/posts/${postId}`, { method, headers: { "content-type": "application/json" }, body: method === "PATCH" ? JSON.stringify(v) : undefined });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Request failed");
      setState("saved");
      setMessage(method === "PATCH" ? "Saved as manual tags." : "Reset to automatic tags.");
      router.refresh();
      if (method === "DELETE") setTimeout(() => window.location.reload(), 150);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void call("PATCH"); }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            <input className="input mt-1 w-full" list={`${uid}-${f.key}`} value={v[f.key]} placeholder="Untagged"
              onChange={(e) => { setV({ ...v, [f.key]: e.target.value }); setState("idle"); }} />
            <datalist id={`${uid}-${f.key}`}>{options[f.key].map((o) => <option key={o} value={o} />)}</datalist>
          </label>
        ))}
        <label className="block">
          <span className="label">News-related</span>
          <select className="input mt-1 w-full" value={v.is_news === null ? "" : v.is_news ? "yes" : "no"}
            onChange={(e) => { setV({ ...v, is_news: e.target.value === "" ? null : e.target.value === "yes" }); setState("idle"); }}>
            <option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={!dirty || state === "saving"}>{state === "saving" ? "Saving…" : "Save tags"}</button>
        {source === "manual" && <button type="button" className="btn" disabled={state === "saving"} onClick={() => void call("DELETE")}>Reset to automatic</button>}
        <span className={`text-xs ${state === "error" ? "text-bad" : "text-muted"}`} role="status">
          {state === "saved" || state === "error" ? message : `Current source: ${source === "manual" ? "manual (yours)" : source === "ai" ? "AI" : source === "rule" ? "rule-based (automatic)" : "none"}`}
        </span>
      </div>
    </form>
  );
}
