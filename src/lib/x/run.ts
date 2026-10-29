import { currentAccount } from "../accounts";
import { runSync, type SyncOptions, type SyncResult } from "./sync";
import { runTwitterApiSync } from "./twitterapi-sync";

/** Syncs the current account from its own source: the X API for main, twitterapi.io for extra accounts. */
export function syncAccount(opts: SyncOptions = {}): Promise<SyncResult> {
  return currentAccount().source === "twitterapi" ? runTwitterApiSync(opts) : runSync(opts);
}
