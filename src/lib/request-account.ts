import { cookies } from "next/headers";
import { findAccount } from "./accounts";

/** Cookie that remembers the account picked in the sidebar. */
export const ACCOUNT_COOKIE = "xa_account";

/**
 * The account key picked in the sidebar (cookie), or null for main. Every page, layout and route
 * handler starts with `enterAccount(await requestAccountKey())`: the enterAccount call must sit in
 * the page's own function - an AsyncLocalStorage scope entered inside a helper does not flow back to
 * the caller after its await - and everything after it then reads that account's database.
 */
export async function requestAccountKey(): Promise<string | null> {
  const key = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  return findAccount(key)?.key ?? null;
}
