import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader for the CLI scripts (Next.js loads .env on its own).
 * Values are only ever placed into process.env - they are never logged.
 */
let loaded = false;
export function loadEnv(root: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    const file = path.join(/*turbopackIgnore: true*/ root, name);
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) continue;
    for (const raw of fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (value && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export interface XCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** Reads the OAuth 1.0a credentials. Throws a message naming missing keys, never their values. */
export function getXCredentials(): XCredentials {
  loadEnv();
  const names = ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"] as const;
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`Missing X API credentials in .env: ${missing.join(", ")}`);
  }
  return {
    consumerKey: process.env.X_CONSUMER_KEY!,
    consumerSecret: process.env.X_CONSUMER_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  };
}

/** Removes anything that looks like a credential from a string before it is logged or stored. */
export function redact(text: string): string {
  let out = text;
  for (const n of ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET", "X_BEARER_TOKEN", "ANTHROPIC_API_KEY"]) {
    const v = process.env[n];
    if (v && v.length >= 6) out = out.split(v).join("[redacted]");
  }
  return out.replace(/oauth_[a-z_]+="[^"]*"/g, 'oauth_*="[redacted]"');
}
