"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Hides a post from the dashboard or restores it. Nothing is deleted: the post keeps its history and
 * stays in the database; it is only left out of lists and numbers. "icon" sits in the Posts table rows.
 */
export function HideButton({ postId, hidden, variant = "button" }: { postId: number; hidden: boolean; variant?: "button" | "icon" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function toggle() {
    setState("saving");
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ hidden: !hidden }) });
      if (!res.ok) throw new Error();
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }
  const label = hidden ? "Restore" : "Hide";
  const title = state === "error" ? "Could not save - try again"
    : hidden ? "Show this post again in every list and number"
    : "Hide from the dashboard: left out of every list and number, history kept, can be restored";
  if (variant === "icon" && !hidden) {
    return (
      <button type="button" className={`icon-btn ${state === "error" ? "text-bad" : ""}`} aria-label="Hide post" title={title} disabled={state === "saving"} onClick={() => void toggle()}>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.6M6.6 6.6C4.4 8 2.9 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      </button>
    );
  }
  return (
    <button type="button" className={`btn ${state === "error" ? "border-bad text-bad" : ""}`} title={title} disabled={state === "saving"} onClick={() => void toggle()}>
      {state === "saving" ? "Saving…" : label}
    </button>
  );
}
