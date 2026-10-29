import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

/**
 * Accounts tracked by the dashboard. Each has its own SQLite file, so every analysis keeps working on
 * one account's data exactly as before; nothing is mixed across accounts.
 *  - main: the account behind the X API keys in .env (full metrics, data/analytics.db or ANALYTICS_DB);
 *  - extra accounts from TWITTERAPI_ACCOUNTS (comma-separated handles), read through twitterapi.io
 *    (public metrics only), each in data/analytics-<handle>.db next to the main file.
 * The account a call works on comes from an AsyncLocalStorage scope (withAccount / enterAccount):
 * pages and route handlers set it from the account cookie, scripts and MCP tools per account.
 */
export type AccountSource = "x" | "twitterapi";
export interface Account {
  key: string;
  source: AccountSource;
  /** Handle from the config; for the main account it is only known from its database (meta). */
  username: string | null;
  dbFile: string;
}
export const MAIN_ACCOUNT = "main";

export function mainDbFile(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.ANALYTICS_DB || "data/analytics.db");
}

export function accounts(): Account[] {
  const main = mainDbFile();
  const list: Account[] = [{ key: MAIN_ACCOUNT, source: "x", username: null, dbFile: main }];
  for (const raw of (process.env.TWITTERAPI_ACCOUNTS ?? "").split(",")) {
    const handle = raw.trim().replace(/^@/, "");
    if (!/^\w{1,15}$/.test(handle)) continue;
    const key = handle.toLowerCase();
    if (key === MAIN_ACCOUNT || list.some((a) => a.key === key)) continue;
    list.push({ key, source: "twitterapi", username: handle, dbFile: path.join(path.dirname(main), `analytics-${key}.db`) });
  }
  return list;
}

export function findAccount(key: string | null | undefined): Account | null {
  return accounts().find((a) => a.key === key) ?? null;
}

// One instance per process, even if the bundler loads this module more than once.
const g = globalThis as unknown as { __xaAccountScope?: AsyncLocalStorage<string> };
const scope = (g.__xaAccountScope ??= new AsyncLocalStorage<string>());

/** The account the current call works on (main when nothing was selected). */
export function currentAccount(): Account {
  return findAccount(scope.getStore()) ?? accounts()[0];
}

/** Runs fn with `key` as the current account (unknown keys fall back to main). */
export function withAccount<T>(key: string | null | undefined, fn: () => T): T {
  return scope.run(findAccount(key)?.key ?? MAIN_ACCOUNT, fn);
}

/** Makes `key` the current account for the rest of this async call chain (used at the top of a page). */
export function enterAccount(key: string | null | undefined): Account {
  const acc = findAccount(key) ?? accounts()[0];
  scope.enterWith(acc.key);
  return acc;
}
