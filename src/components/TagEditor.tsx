"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Edit a post's format (series). Topic, type and hook tags were removed at the owner's request. */
export function TagEditor({ postId, initial, options, source }: { postId: number; initial: string; options: readonly string[]; source: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function call(method: "PATCH" | "DELETE") {
    setState("saving");
    try {
      const res = await fetch(`/api/posts/${postId}`, { method, headers: { "content-type": "application/json" }, body: method === "PATCH" ? JSON.stringify({ series: v }) : undefined });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Request failed");
      setState("saved");
      setMessage(method === "PATCH" ? "Saved as your choice." : "Back to automatic detection.");
      router.refresh();
      if (method === "DELETE") setTimeout(() => window.location.reload(), 150);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void call("PATCH"); }}>
      <label className="block max-w-xs">
        <span className="label">Format</span>
        <select className="input mt-1 w-full" value={v} onChange={(e) => { setV(e.target.value); setState("idle"); }}>
          {!options.includes(v) && <option value={v}>{v || "Not set"}</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={v === initial || state === "saving"}>{state === "saving" ? "Saving…" : "Save"}</button>
        {source === "manual" && <button type="button" className="btn" disabled={state === "saving"} onClick={() => void call("DELETE")}>Reset to automatic</button>}
        <span className={`text-xs ${state === "error" ? "text-bad" : "text-muted"}`} role="status">
          {state === "saved" || state === "error" ? message : `Source: ${source === "manual" ? "your choice" : "automatic (from the headline)"}`}
        </span>
      </div>
    </form>
  );
}
