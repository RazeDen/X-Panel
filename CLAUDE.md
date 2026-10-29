# CLAUDE.md

Personal X (Twitter) analytics for one account (@razeden0): collect own posts through the X API, keep the full metric history in SQLite, tag posts (including the owner's two content series), track early growth (first hour, same-age rank), score posts against the account's own baseline, and show it all in a local dashboard. README.md is the full reference (data model, capability report, methodology, limitations) - read it before larger changes.

The owner talks to Claude in Ukrainian. Code, comments and commit messages stay in English.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dashboard at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Self-test (`scripts/selftest.ts`): mock X server + temp DB, no credits, never touches `data/analytics.db` |
| `npm run sync` | Incremental sync, last 45 days, every account (`-- --days=N`, `-- --account=secondhandle`) |
| `npm run sync:full` | Whole timeline (X serves up to ~3,200 most recent posts) |
| `npm run sync:auto` | Run every 5 min by the scheduler: syncs the last 2 days only when a post is exactly 1h / 6h / 24h old (+/- 2.5 min) or 15 min passed since the last sync |
| `npm run sync:fresh` | Sync posts from the last 2 days, now |
| `npm run schedule:install` / `schedule:remove` | Windows only: register / remove Task Scheduler jobs. Not used any more - the server uses systemd timers from `deploy/` |
| `npm run backup` | Online SQLite backup to `data/backups/analytics-YYYY-MM-DD.db`, keeps 14 (run daily by `x-panel-backup.timer`) |
| `npm run classify` | Re-apply the automatic format (series) and media type; manual formats are kept |
| `npm run audit:x` | Live capability check (profile + 5 posts) and stored capability report |
| `npm run db:migrate` | Apply schema migrations (every command also does this on open) |
| `npm run import:legacy` | Import `posts_YYYY-MM-DD.json` from the old Python collector as historical snapshots |
| `npm run mcp` | MCP server for Claude Desktop (stdio); normally started by Claude Desktop itself |
| `npm run mcp:install` | Registers the MCP server in Claude Desktop's config; must run while Claude Desktop is fully closed |

Run `npm run typecheck && npm test` after any change to `src/lib` or `scripts`.

## Hard rules

- **Secrets.** Never print, log, hardcode or commit secrets. Never open or print `.env`; only `.env.example` may be read. `.env` stays gitignored. Pass anything that may be logged or stored through `redact()` (`src/lib/env.ts`).
- **Server-side API only.** X API calls happen in CLI scripts and route handlers. Nothing under `src/components` or any client component imports `src/lib/x/*`. No `NEXT_PUBLIC_` names for keys.
- **History is append-only.** Never delete rows from `posts`, `metric_snapshots` or `account_snapshots`. A post X stops returning is only flagged (`missing_since`). "Delete" in the UI means hide (`hidden_at`, see Methodology), never a row deletion and never a call to X. Manual tags (`class_source = 'manual'`, `format_source = 'manual'`) are never overwritten by sync, rules or AI.
- **No invented numbers.** An unavailable metric is `NULL` / "unavailable", never 0. A rate is `NULL` when its numerator is missing or impressions are missing or zero. Never fabricate analytics or explanations.
- **Show sample size.** Every aggregate carries `n`. Prefer median over average. Label n=1 explicitly. Groups below `MIN_SAMPLE` (3) are marked low sample.
- **Wording.** Say "low distribution relative to baseline". Never claim "X suppressed this post" or explain why the algorithm did something.
- **Private metrics expire.** `non_public_metrics`, `organic_metrics` and video quartiles exist only for posts under ~30 days old. API errors for older posts and for retweets on those fields are expected and non-fatal.
- **Not offered by the API at all:** watch time, followers gained per post, media engagements / detail expands. `link_clicks` exists only for posts with a clickable link or card.

## Accounts (since 2026-10-29)

- `src/lib/accounts.ts`: `main` = the X API account (data/analytics.db or `ANALYTICS_DB`); extra accounts from `TWITTERAPI_ACCOUNTS` (handles, e.g. a second account of the owner), each with `data/analytics-<key>.db`, read through **twitterapi.io** (owner's choice: no X keys for them; public metrics only). One database per account, so every analysis is unchanged and per account; never mix accounts in one number.
- The current account is an AsyncLocalStorage scope: `getDb()` / `dbPath()` follow `currentAccount()`. **Every page, layout and route handler must start with `enterAccount(await requestAccountKey())` (`src/lib/request-account.ts`, cookie `xa_account`) before touching data** - in its own function: an ALS scope entered inside a helper does not flow back to the caller after `await`; scripts and MCP tools use `withAccount(key, fn)`. Code outside a scope works on `main`.
- Sync: `syncAccount` (`src/lib/x/run.ts`) picks `runSync` (X API) or `runTwitterApiSync` (`src/lib/x/twitterapi-sync.ts`). twitterapi.io bills every re-read, so incremental = one `from:<handle> since_time:` search + refresh of the window's stored originals by id (50 per request); full = `last_tweets` with replies. Same `writePosts` / `postProcess` / capabilities as the X sync; private metrics stay null.
- `auto-sync`, `sync`, `backup`, `classify`, `db:migrate` loop over all accounts; one account's failure does not stop the others. `audit:x` and `import:legacy` are main only. Comments run per account.
- UI: the sidebar footer is the account switcher (`AccountSwitcher` in Sidebar.tsx, POST `/api/account`). MCP: every tool gets an optional `account` arg (wrapper in `createMcpServer`), INSTRUCTIONS list the accounts.

## Production server (since 2026-10-07)

The live installation runs on the owner's Ubuntu 24.04 VPS (`root@<server-ip>`, Tailscale name `x-panel`); the PC copy is for reference/dev only and its database is no longer synced.
- Code: `/opt/x-panel/app` (git checkout, owned by system user `xpanel`, home `/opt/x-panel`). `.env` there is mode 600.
- Services (`deploy/`): `x-panel-web.service` (next start on 127.0.0.1:3000), `x-panel-auto-sync.timer` (5 min), `x-panel-daily-sync.timer` (08:00 Europe/Warsaw), `x-panel-backup.timer` (03:30, 14 dated copies). Logs: `journalctl -u x-panel-*`.
- Access: `tailscale serve --http 80` -> `http://x-panel` from the owner's tailnet only. Never open port 3000 or the dashboard on the public IP: it has no login and a paid Sync button.
- After code changes on the server: `sh /opt/x-panel/app/deploy/update.sh` (as root). Run commands as `xpanel` (`runuser -u xpanel -- env HOME=/opt/x-panel ...`), never leave root-owned files in the app.
- Claude Desktop MCP runs over SSH: `npm run mcp:install -- --ssh root@<server-ip>` (PC, Claude Desktop closed) -> `scripts/mcp-remote.sh` on the server. The entry sets `ProgramData` because Windows OpenSSH exits silently without it.
- The Windows Task Scheduler jobs were removed on 2026-10-07 (sync runs only on the server now).

## MCP server (Claude Desktop)

The owner's Claude Desktop chat reads the dashboard data through a local stdio MCP server: `scripts/mcp.ts` (entry: moves to the project root, sends all logs to stderr) and `src/lib/mcp/server.ts` (tools). Tools: `get_overview`, `list_posts`, `get_post`, `get_recent_performance`, `get_breakdown`, `get_outliers`, `get_activity`, `list_comments`, `get_data_status`, and the paid `run_sync`. They reuse the same library functions as the pages, so numbers match the dashboard. Registered in `%APPDATA%\Claude\claude_desktop_config.json` as `x-analytics` by `npm run mcp:install` (`scripts/install-mcp.ts`). Claude Desktop rewrites that file from memory, so never edit it while the app runs (an entry added that way on 2026-10-06 was lost); Claude Code runs inside that app, so the owner has to quit it and run the command from a separate terminal.

- **Keep it in sync with the dashboard (owner's standing request).** Whenever a page, metric, filter, tag dimension, methodology rule or data-model field is added or changes significantly, update the matching tool(s) in `src/lib/mcp/server.ts`, the `INSTRUCTIONS` text, the README tool table and the MCP checks in `scripts/selftest.ts` in the same change, bump `MCP_VERSION`, and tell the owner to restart Claude Desktop.
- stdout is the protocol channel: never write to stdout in code reachable from the MCP server; use `console.error`.
- Read tools never call the X API. `run_sync` does (about $0.13 per incremental run) and must say so in its description.
- Same hard rules apply to tool output: nulls stay null, `n` always included, no causal claims.

## UI style

All UI follows **DESIGN.md**: the X Developer Console look (console.x.com dark theme - black canvas, floating bordered panels, neutral greys, Inter, white primary buttons, 6/10/14px radii, Sync button in the top bar). Read it before adding or changing any page, component or chart, and reuse the components it lists. Changes to the style go into DESIGN.md first.

## Methodology (keep consistent)

- The Timing page was removed at the owner's request (2026-10-07); posting-time breakdowns remain in MCP `get_breakdown` (bucket / dow / hour).
- Hidden posts (owner's request 2026-10-29, chose "hide" over deleting): `posts.hidden_at` set by the eye icon in the Posts table or Hide on the post page (`setHidden` in classify/store.ts, PATCH `/api/posts/[id]` `{ hidden }`). `loadPosts` drops them before scoring and ranking, so they are out of every list, aggregate, baseline, rank and MCP tool; `Dataset.hidden` holds them for the Posts "Hidden" tab (Restore), the post page and MCP `get_post` / `get_data_status`. Sync keeps updating them; restoring brings them back with full history.
- Comments (owner's request 2026-10-29): replies by other accounts, read through **twitterapi.io** (`src/lib/comments/`, key `TWITTERAPI_IO_KEY`, optional), not the X API, because X bills $0.005 per comment + $0.01 per author profile. `comments` table (migration 4), append-only, `hidden_at` for spam. "Answered" is derived (own reply in `posts` with `referenced_id` = comment id), never stored. `commentsDue` asks only when the 14-day reply-count sum changed or 60 min passed; `syncComments` reads mentions since the last check (first: 7 days) and keeps only replies to the owner by others. Run from `scripts/auto-sync.ts` after the post sync; a comment failure never fails the post sync (error in meta `comments_last_error`, shown on the page). Unanswered comments older than 30 h are "expired" and not shown (`COMMENT_MAX_AGE_HOURS`, owner's request). Each card shows the post thumbnail (`media_preview`). Drafts (owner's choice 2026-10-29, after trying claude.ai links): "Draft in Claude" only copies `draftMessage` (post, the owner's reply it answers if any, the comment) to the clipboard (execCommand fallback, because http://x-panel is not a secure context); the owner pastes it into a Claude chat of their own whose instructions set the voice. No Anthropic API key, never use the owner's subscription token from code. Nothing is ever posted to X from the dashboard.
- Weekly reports were removed at the owner's request (2026-10-06); the `weekly_reports` table stays in the DB, unused.
- Bait / no bait was removed at the owner's request (2026-10-29): `hasBait`, the Overview card, the Content tab, the Patterns and Outliers groups, the Posts chip and the MCP `bait` field / breakdown dimension are gone. Never derive or show it again. It was never stored, so the DB is unchanged. The Overview's week-vs-week chart now spans the full row where the bait card was.
- Topic, subtopic, content type, hook and the news flag were removed at the owner's request (2026-10-07): never derive, show, filter or count them again (no rule or AI tagging). The columns stay in the DB, unused. AI classification (`classify/ai.ts`) was deleted with them.
- Naming: in the UI the series field is labelled **"Format"** (owner's request 2026-10-07); the structural media format (Video, Image ...) is labelled "Media" and is hidden from the Posts page, its filters and the Content tabs because nearly every post is a video. The Posts page lists original posts only (no kind selector).
- Series = owner's content line: Animated file / Animated scene / Other (`deriveSeries` in classify/rules.ts, headline of video/GIF posts; manual values win).
- Early growth (`src/lib/analytics/growth.ts`): impressions at 1h/6h/24h only from snapshots (measured near the age, or interpolated between close snapshots, else null). Latest-post card ranks among the last 10 at the same age when >= 3 comparable posts, else by total (labelled). Status icons: above p75 / below p25 / check in between, only with n >= 3; first hour / 6h / 24h use above / below the median from n = 1 (owner's request, n shown when < 3). Exact capture ages: `CAPTURE_MINUTES` = 60, 360, 1440 (owner chose only these; no 15/30/45-min marks). The latest-post card has no rank row and no bookmark rate (owner's request); its engagement-rate arrow compares with the median ER of the 15 posts with the most similar impressions (`similarReach`, log scale), because ER falls as reach grows.

- Engagement rate = (likes + replies + reposts + quotes + bookmarks) / impressions. Public interactions only, so old posts stay comparable.
- Originals = `post` + `quote` without `article_title`. Replies, reposts and X Articles are stored and browsable but excluded from baselines, scores, reports and post counts (owner's decision, 2026-10-05). Quote posts promoting an article stay in.
- Reference set for a post: the account's own originals from the 90 days before it (no look-ahead); fallback to all other originals if fewer than 8 (`MIN_REFERENCE`). Nothing is scored with fewer than 8 in total.
- Robust z-score on log10(impressions + 1): `0.6745 * (x - median) / MAD`. Outliers: z >= 3.5 far above, z >= 2 above, z <= -2 below (`src/lib/analytics/scoring.ts`).
- Distribution score = percentile of impressions in the reference set. Engagement quality score = equal-weight mean of rate percentiles (like, reply, repost, bookmark, profile visit), unavailable rates left out.
- Posts under 48h old at the last sync are "maturing".
- Calendar: Europe/Warsaw (`ANALYTICS_TZ`), ISO weeks (`2026-W40`).

## X API pricing

Pay-per-use: own post read $0.001, other users' posts $0.005, user lookup $0.01; re-reading the same resource is deduplicated per UTC day. An incremental sync is ~120 own-post reads + 1 lookup. Comments come from twitterapi.io instead ($0.15 per 1,000 tweets with author profiles, minimum $0.00015 per request even when empty - keep requests gated). **State the cost impact before adding any new API call, expansion or field that reads non-owned resources** (e.g. expanding `referenced_tweets.id` is deliberately avoided).

## Stack and layout

Next.js 16 App Router, React 19, TypeScript 5.9 (strict), Tailwind 3 (colors as CSS-variable RGB channels in `globals.css`), Inter + Geist Mono via `next/font/google`, Recharts 3, better-sqlite3 12 (native, `serverExternalPackages`), tsx for scripts, undici (only when `HTTPS_PROXY` is set).

```
src/lib/env.ts          .env loader for scripts, credentials, redact()
src/lib/accounts.ts     account list, per-account database, current-account scope; request-account.ts (cookie)
src/lib/db.ts           SQLite schema, migrations (append new ones, never edit applied ones)
src/lib/x/              client.ts (OAuth 1.0a, retries, rate limits), map.ts (payload -> row), sync.ts
src/lib/metrics.ts      per-post rates; stats.ts null-safe stats helpers
src/lib/analytics/      scoring, summaries, time series, activity, growth (early performance)
src/lib/comments/       twitterapi.io client, comment sync (gated), comment list / hide / Claude draft prompt
src/lib/classify/       taxonomy (Content dimensions), rules (series, media type), store (manual format)
src/app/                dashboard pages + API routes (api/sync, api/posts/[id])
scripts/                CLI entry points and selftest
data/analytics.db       the database (gitignored); data/backups/ also gitignored
deploy/                 systemd units for the server + update.sh (rebuild and restart after code changes)
scripts/mcp-remote.sh   MCP entry point used by Claude Desktop over SSH
scripts/schedule-sync.ps1, scheduled-sync.cmd   old Windows Task Scheduler jobs (no longer installed)
```

Windows notes: npm 11+ blocks install scripts unless allowed; `package.json` `allowScripts` approves `better-sqlite3` and `esbuild`. The DB uses `journal_mode = DELETE`, so a transient `analytics.db-journal` during writes is normal.

## Known caveats and open items

- Scheduled sync runs on the production server (systemd timers, see "Production server"); the Windows Task Scheduler jobs on the PC were removed on 2026-10-07. Early-growth data exists only for posts published after automatic syncing started (2026-10-06/07).
- Legacy files `x_collect.py`, `posts_2026-10-05.csv` / `.json` and `account_history.csv` are kept for reference only; do not build on them.
