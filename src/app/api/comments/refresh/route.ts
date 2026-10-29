import { NextResponse } from "next/server";
import { checkOwnReplies, syncComments } from "@/lib/comments/sync";
import { requestAccountKey } from "@/lib/request-account";
import { enterAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";
let running = false;

/**
 * "Check now" on the Comments page: reads new comments, then the owner's recent replies, so comments
 * already answered leave the list (twitterapi.io, about $0.00015 per request + $0.00015 per tweet).
 */
export async function POST() {
  enterAccount(await requestAccountKey());
  if (running) return NextResponse.json({ error: "Already checking." }, { status: 409 });
  running = true;
  try {
    const r = await syncComments();
    const replies = await checkOwnReplies();
    return NextResponse.json({ ok: true, ...r, answered: replies.answered, requests: r.requests + replies.requests });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read comments" }, { status: 502 });
  } finally {
    running = false;
  }
}
