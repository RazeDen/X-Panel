"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Copies text without the Clipboard API when it is unavailable: the dashboard is served over plain
 * http on the tailnet, which is not a secure context, so navigator.clipboard is undefined there.
 */
function copyText(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Actions on one comment: copy the post + comment for the owner's own Claude chat (nothing is sent
 * from here), open it on X to answer, and hide / restore it. Hiding never deletes anything.
 */
export function CommentActions({ id, url, draft, hidden }: { id: string; url: string; draft: string | null; hidden: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [copied, setCopied] = useState<null | boolean>(null);
  function copyDraft() {
    if (draft === null) return;
    const ok = navigator.clipboard?.writeText ? (navigator.clipboard.writeText(draft).catch(() => copyText(draft)), true) : copyText(draft);
    setCopied(ok);
    setTimeout(() => setCopied(null), 4000);
  }
  async function toggle() {
    setState("saving");
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ hidden: !hidden }) });
      if (!res.ok) throw new Error();
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {draft && (
        <button type="button" className="btn btn-primary" onClick={copyDraft}
          title="Copies the post and this comment. Paste it (Ctrl+V) into your Claude chat for replies.">
          Draft in Claude
        </button>
      )}
      <a href={url} target="_blank" rel="noreferrer" className="btn">Open on X &#8599;</a>
      <button type="button" className={`btn ${state === "error" ? "border-bad text-bad" : ""}`} disabled={state === "saving"} onClick={() => void toggle()}
        title={state === "error" ? "Could not save - try again" : hidden ? "Show it in the list again" : "Spam or nothing to answer: remove it from the list (kept in the database)"}>
        {state === "saving" ? "Saving…" : hidden ? "Restore" : "Hide"}
      </button>
      {copied !== null && <span className="text-xs text-muted" role="status">{copied ? "Copied - paste it into your Claude chat" : "Could not copy - try again"}</span>}
    </div>
  );
}

/** "Check now": reads new comments from twitterapi.io right away (about $0.00015 per request). */
export function RefreshComments() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function run() {
    setState("busy");
    try {
      const res = await fetch("/api/comments/refresh", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setState("idle");
      setMsg(`${j.inserted} new`);
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <span className="flex items-center gap-2">
      {msg && <span className={`text-xs ${state === "error" ? "text-bad" : "text-muted"}`} role="status">{msg}</span>}
      <button type="button" className="btn" disabled={state === "busy"} onClick={() => void run()} title="Read new comments now (about $0.00015 per request). They are also checked automatically.">
        {state === "busy" ? "Checking…" : "Check now"}
      </button>
    </span>
  );
}
