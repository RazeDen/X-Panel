import crypto from "node:crypto";
import { getXCredentials, redact, type XCredentials } from "../env";

/**
 * Thin X API v2 client using OAuth 1.0a user context (the same credentials the
 * original x_collect.py used). Server-side only: this module must never be imported
 * from a client component.
 */
export type XErrorKind = "auth" | "rate_limit" | "http" | "network" | "config";
export class XApiError extends Error {
  constructor(public kind: XErrorKind, message: string, public status?: number) {
    super(message);
    this.name = "XApiError";
  }
}

const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function oauthHeader(method: string, url: string, params: Record<string, string>, c: XCredentials): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: c.accessToken,
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join("&");
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join("&");
  const key = `${pct(c.consumerSecret)}&${pct(c.accessTokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
}

type FetchLike = (url: string, init: Record<string, unknown>) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

let transport: Promise<{ fetch: FetchLike; dispatcher?: unknown }> | null = null;
/** Uses the system proxy when HTTPS_PROXY is set (corporate networks, sandboxes); plain fetch otherwise. */
function getTransport() {
  if (!transport) {
    transport = (async () => {
      const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
      if (!proxy) return { fetch: globalThis.fetch as unknown as FetchLike };
      const undici = await import("undici");
      return { fetch: undici.fetch as unknown as FetchLike, dispatcher: new undici.EnvHttpProxyAgent() };
    })();
  }
  return transport;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface XClientOptions {
  log?: (msg: string) => void;
  /** Longest the client will wait for a rate-limit window to reset before giving up. */
  maxRateLimitWaitMs?: number;
  maxRetries?: number;
}

export class XClient {
  requests = 0;
  private creds: XCredentials;
  private base: string;
  private log: (msg: string) => void;
  private maxWait: number;
  private maxRetries: number;

  constructor(opts: XClientOptions = {}) {
    this.creds = getXCredentials();
    this.base = (process.env.X_API_BASE || "https://api.x.com/2").replace(/\/$/, "");
    this.log = opts.log ?? (() => {});
    this.maxWait = opts.maxRateLimitWaitMs ?? 16 * 60 * 1000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  async get<T = unknown>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") clean[k] = String(v);
    const url = this.base + path;
    const query = Object.keys(clean).map((k) => `${pct(k)}=${pct(clean[k])}`).join("&");
    const full = query ? `${url}?${query}` : url;
    const { fetch, dispatcher } = await getTransport();

    let attempt = 0;
    for (;;) {
      attempt++;
      this.requests++;
      let res;
      try {
        res = await fetch(full, {
          method: "GET",
          headers: { Authorization: oauthHeader("GET", url, clean, this.creds), "User-Agent": "x-analytics-local/1.0" },
          signal: AbortSignal.timeout(30000),
          ...(dispatcher ? { dispatcher } : {}),
        });
      } catch (err) {
        if (attempt <= this.maxRetries) {
          const wait = 1000 * 2 ** (attempt - 1);
          this.log(`network error on ${path} (attempt ${attempt}), retrying in ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
        const detail = cause?.code || cause?.message || (err as Error).message;
        throw new XApiError("network", `Could not reach the X API (${redact(String(detail))}). Check your internet connection.`);
      }

      const body = await res.text();
      if (res.status === 200) {
        try {
          return JSON.parse(body) as T;
        } catch {
          throw new XApiError("http", `X API returned a non-JSON response for ${path}`, 200);
        }
      }
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-rate-limit-reset")) * 1000;
        const wait = Number.isFinite(reset) && reset > 0 ? Math.max(reset - Date.now(), 0) + 2000 : 60000;
        if (wait > this.maxWait || attempt > this.maxRetries) {
          throw new XApiError("rate_limit", `X API rate limit reached on ${path}; window resets in ~${Math.ceil(wait / 60000)} min. Nothing was changed - run the sync again later.`, 429);
        }
        this.log(`rate limited on ${path}; waiting ${Math.ceil(wait / 1000)}s for the window to reset`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt <= this.maxRetries) {
        const wait = 1500 * 2 ** (attempt - 1);
        this.log(`X API ${res.status} on ${path} (attempt ${attempt}), retrying in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      let detail = body.slice(0, 300);
      try {
        const j = JSON.parse(body);
        detail = j.detail || j.title || j.errors?.[0]?.message || detail;
      } catch { /* keep raw text */ }
      if (res.status === 401 || res.status === 403) {
        throw new XApiError("auth", `X API rejected the credentials (${res.status}): ${redact(detail)}. Check the keys in .env and the app permissions.`, res.status);
      }
      if (res.status === 402) {
        throw new XApiError("http", `X API returned 402 (payment required): ${redact(detail)}. Check your credit balance in the developer console.`, 402);
      }
      throw new XApiError("http", `X API error ${res.status} on ${path}: ${redact(detail)}`, res.status);
    }
  }
}
