# CLAUDE.md

Personal X (Twitter) analytics for one account (@razeden0): collect own posts through the X API, keep the full metric history in SQLite, tag and score posts against the account's own baseline, write weekly reports, show it all in a local dashboard. README.md is the full reference (data model, capability report, methodology, limitations) - read it before larger changes.

The owner talks to Claude in Ukrainian. Code, comments and commit messages stay in English.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dashboard at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Self-test (`scripts/selftest.ts`): mock X server + temp DB, no credits, never touches `data/analytics.db` |
| `npm run sync` | Incremental sync, last 45 days (`-- --days=N` to change) |
| `npm run sync:full` | Whole timeline (X serves up to ~3,200 most recent posts) |
| `npm run weekly` | Sync + weekly report for the last completed ISO week (`--week=2026-W40`, `--current`, `--no-sync`) |
| `npm run classify` | Re-apply rule tags (`-- --ai` for AI tags, `--export` / `--import` for bulk tags) |
| `npm run audit:x` | Live capability check (profile + 5 posts) and stored capability report |
| `npm run db:migrate` | Apply schema migrations (every command also does this on open) |
| `npm run import:legacy` | Import `posts_YYYY-MM-DD.json` from the old Python collector as historical snapshots |

Run `npm run typecheck && npm test` after any change to `src/lib` or `scripts`.

## Hard rules

- **Secrets.** Never print, log, hardcode or commit secrets. Never open or print `.env`; only `.env.example` may be read. `.env` stays gitignored. Pass anything that may be logged or stored through `redact()` (`src/lib/env.ts`).
- **Server-side API only.** X API calls happen in CLI scripts and route handlers. Nothing under `src/components` or any client component imports `src/lib/x/*`. No `NEXT_PUBLIC_` names for keys.
- **History is append-only.** Never delete rows from `posts`, `metric_snapshots` or `account_snapshots`. A post X stops returning is only flagged (`missing_since`). Manual tags (`class_source = 'manual'`, `format_source = 'manual'`) are never overwritten by sync, rules or AI.
- **No invented numbers.** An unavailable metric is `NULL` / "unavailable", never 0. A rate is `NULL` when its numerator is missing or impressions are missing or zero. Never fabricate analytics or explanations.
- **Show sample size.** Every aggregate carries `n`. Prefer median over average. Label n=1 explicitly. Groups below `MIN_SAMPLE` (3) are marked low sample.
- **Wording.** Say "low distribution relative to baseline". Never claim "X suppressed this post" or explain why the algorithm did something.
- **Private metrics expire.** `non_public_metrics`, `organic_metrics` and video quartiles exist only for posts under ~30 days old. API errors for older posts and for retweets on those fields are expected and non-fatal.
- **Not offered by the API at all:** watch time, followers gained per post, media engagements / detail expands. `link_clicks` exists only for posts with a clickable link or card.

## UI style

All UI follows **DESIGN.md**: the X Developer Console look (console.x.com dark theme - black canvas, floating bordered panels, neutral greys, Inter, white primary buttons, 6/10/14px radii, Sync button in the top bar). Read it before adding or changing any page, component or chart, and reuse the components it lists. Changes to the style go into DESIGN.md first.

## Methodology (keep consistent)

- Engagement rate = (likes + replies + reposts + quotes + bookmarks) / impressions. Public interactions only, so old posts stay comparable.
- Originals = `post` + `quote` without `article_title`. Replies, reposts and X Articles are stored and browsable but excluded from baselines, scores, reports and post counts (owner's decision, 2026-10-05). Quote posts promoting an article stay in.
- Reference set for a post: the account's own originals from the 90 days before it (no look-ahead); fallback to all other originals if fewer than 8 (`MIN_REFERENCE`). Nothing is scored with fewer than 8 in total.
- Robust z-score on log10(impressions + 1): `0.6745 * (x - median) / MAD`. Outliers: z >= 3.5 far above, z >= 2 above, z <= -2 below (`src/lib/analytics/scoring.ts`).
- Distribution score = percentile of impressions in the reference set. Engagement quality score = equal-weight mean of rate percentiles (like, reply, repost, bookmark, profile visit), unavailable rates left out.
- Posts under 48h old at the last sync are "maturing".
- Calendar: Europe/Warsaw (`ANALYTICS_TZ`), ISO weeks (`2026-W40`).
- Weekly narrative lines are labelled `DATA` / `HYPOTHESIS` / `EXPERIMENT`; group hypotheses need n >= 3.

## X API pricing

Pay-per-use: own post read $0.001, other users' posts $0.005, user lookup $0.01; re-reading the same resource is deduplicated per UTC day. An incremental sync is ~120 own-post reads + 1 lookup. **State the cost impact before adding any new API call, expansion or field that reads non-owned resources** (e.g. expanding `referenced_tweets.id` is deliberately avoided).

## Stack and layout

Next.js 16 App Router, React 19, TypeScript 5.9 (strict), Tailwind 3 (colors as CSS-variable RGB channels in `globals.css`), Inter + Geist Mono via `next/font/google`, Recharts 3, better-sqlite3 12 (native, `serverExternalPackages`), tsx for scripts, undici (only when `HTTPS_PROXY` is set).

```
src/lib/env.ts          .env loader for scripts, credentials, redact()
src/lib/db.ts           SQLite schema, migrations (append new ones, never edit applied ones)
src/lib/x/              client.ts (OAuth 1.0a, retries, rate limits), map.ts (payload -> row), sync.ts
src/lib/metrics.ts      per-post rates; stats.ts null-safe stats helpers
src/lib/analytics/      scoring, summaries, series, weekly report, report store
src/lib/classify/       taxonomy, rule classifier, optional AI classifier, tag store
src/app/                dashboard pages + API routes (api/sync, api/posts/[id])
scripts/                CLI entry points and selftest
data/analytics.db       the database (gitignored); data/backups/ also gitignored
reports/                weekly reports as Markdown
```

Windows notes: npm 11+ blocks install scripts unless allowed; `package.json` `allowScripts` approves `better-sqlite3` and `esbuild`. The DB uses `journal_mode = DELETE`, so a transient `analytics.db-journal` during writes is normal.

## Known caveats and open items

- AI classification and the AI weekly text (`ANTHROPIC_API_KEY`) were never tested live.
- No scheduled sync is set up yet (README "Automation" has ready `schtasks` commands).
- Legacy files `x_collect.py`, `posts_2026-10-05.csv` / `.json` and `account_history.csv` are kept for reference only; do not build on them.
