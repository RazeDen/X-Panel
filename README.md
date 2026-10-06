# X-Panel

A personal analytics system for one X (Twitter) account. It pulls your own posts through the X API, keeps a local history of their metrics in SQLite, tags every post, compares posts against your own baseline, writes a weekly report, and shows all of it in a local dashboard styled after the X Developer Console. An MCP server lets Claude Desktop query the same data.

Everything runs on your machine. There is no login, no cloud service and no telemetry.

## How to start

Requirements: Node.js 20 or newer (22 LTS recommended) and an X developer app with OAuth 1.0a user-context keys (read access is enough). The X API is pay-per-use; see "API cost" under Automation.

```
cp .env.example .env # then fill in your keys (see below)
npm install          # once
npm run db:migrate   # creates data/analytics.db if it does not exist (optional - every command does this)
npm run sync         # first run downloads your whole timeline
npm run dev          # dashboard at http://localhost:3000
```

Then, once a week:

```
npm run weekly
```

`.env` needs the four values of your X app (developer console: your app's keys and tokens). It is gitignored and never leaves your machine:

```
X_CONSUMER_KEY=
X_CONSUMER_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dashboard on http://localhost:3000 |
| `npm run build` / `npm start` | Production build and server (faster than dev mode) |
| `npm run sync` (alias `npm run sync:x`) | Incremental sync: posts from the last 45 days. New posts are added, recent posts get fresh numbers, and one snapshot per post is appended to the history |
| `npm run sync -- --days=90` | Incremental sync with a different window |
| `npm run sync:full` | Re-reads the whole timeline (up to the 3,200 most recent posts). Use for debugging or to refresh old posts |
| `npm run weekly` | Full weekly pipeline for the last completed week: sync, snapshots, derived metrics, weekly aggregates, outliers, validation, saved report |
| `npm run weekly -- --week=2026-W40` | Same for a specific ISO week |
| `npm run weekly -- --current` | The week in progress |
| `npm run weekly -- --no-sync` | Build the report from stored data without calling X |
| `npm run classify` | Re-applies rule-based tags (never touches manual or AI tags) |
| `npm run classify -- --ai` | AI-tags posts that only have rule-based tags (needs `ANTHROPIC_API_KEY`) |
| `npm run classify -- --export tags.json` / `--import tags.json` | Bulk export / import of tags |
| `npm run audit:x` | Prints the capability report: which metrics X returns for your posts |
| `npm run import:legacy` | Imports `posts_YYYY-MM-DD.json` files written by the original `x_collect.py` as historical snapshots |
| `npm test` | Self-test against a temporary database and a local mock of the X API. Spends no credits and does not touch your data |
| `npm run typecheck` | TypeScript check |

`npm run weekly` prints a summary like this (illustrative numbers):

```
Week 40 processed (Sep 28 - Oct 4, 2026)
Sync: 120 posts fetched, 2 new, 118 snapshots
Posts: 12
Total impressions: 24,310 (+18% vs previous week)
Median impressions: 1,240 (+6% vs previous week, -4% vs 30-day baseline)
Top post: 6,820 impressions - "Example post title..."
Validation: ok
Report saved successfully: reports/2026-W40.md (also in the dashboard under Weekly)
```

If the sync step fails (no internet, rate limit, bad keys), the weekly command says so and builds the report from the data already stored. Nothing is deleted.

## The dashboard

| Page | What it shows |
|---|---|
| Overview | Headline cards with change vs the previous period, impressions / posts / engagement rate over time, current vs previous week, best and worst post, biggest outliers, rolling account baseline, follower count |
| Posts | Searchable, sortable table of every stored post. Filters: date range, week, kind, topic, format, content type, hook, minimum impressions, text. Toggle between counts and per-impression rates |
| Post detail | Full text, link to X, editable tags, metric cards, rates against your baseline, the two scores, growth curve from snapshots, video retention, similar posts |
| Content | Performance grouped by topic, subtopic, format, content type or hook |
| Timing | Hour of day, time slots, day of week and a day-by-slot grid, in Europe/Warsaw time |
| Weekly report | Week selector, headline metrics vs the previous week and the 30-day baseline, what worked / underperformed / signals / hypotheses / experiments, top and weak posts, outliers, breakdowns |
| Patterns | Best topics, hooks, formats, content types, time slots and days over 7 / 30 / 90 days or all time, plus the categories with the highest bookmark, repost and engagement rates |
| Outliers | Posts far above or below your own baseline, a reach-vs-quality chart, and posts with low distribution but high engagement quality |
| Data & methods | Sync button, data-quality warnings, capability report, sync history, methodology |

Filters live in the URL, so any view can be bookmarked. Charts are clickable: a bar opens the posts behind it, a dot opens the post.

## Data model

One SQLite file: `data/analytics.db`. Tables:

- `posts` - one row per post: X id, URL, full text (long-post body and article text included), timestamps (`created_at`, `first_seen_at`, `last_synced_at`), structure (kind, media, links, thread / quote flags), tags (`topic`, `subtopic`, `content_type`, `hook_type`, `is_news`, `format` and where each came from: `manual`, `ai` or `rule`), the latest metrics, and the derived rates.
- `metric_snapshots` - the history. Every sync appends one row per post with the metrics at that moment. Nothing is overwritten, so growth curves build up over time.
- `account_snapshots` - follower / following / post counts at every sync.
- `sync_runs` - a log of every sync: mode, status, counts, API calls, warnings, error message.
- `capabilities` - which metrics X actually returned, rebuilt after every sync.
- `weekly_reports` - saved weekly reports (full JSON plus optional AI text).
- `meta` - last successful sync, account handle.

A metric X does not return is stored as `NULL` and shown as a dash. It is never turned into 0. Posts and snapshots are never deleted: a post that stops appearing in the API is only flagged (`missing_since`).

Original posts and quote posts are analysed. Replies, reposts and X Articles (long-form posts, `article_title` set) are stored and can be browsed (Posts page, "Kind" filter), but they are excluded from baselines, scores, reports and post counts because their reach is not comparable. Quote posts that promote an article are ordinary posts and stay in.

## What X returns (capability report)

Checked against the live API for this account on 2026-10-05. The current state is always on the Data & methods page.

| Metric | Status |
|---|---|
| Impressions, likes, replies, reposts, quotes, bookmarks | Available for all posts |
| Video views | Available for all video posts |
| Profile visits, X-reported engagements, organic impressions | Available for recent posts only. X refuses these fields for posts older than about 30 days |
| Video playback quartiles (0 / 25 / 50 / 75 / 100%) | Available for recent video posts only |
| Link clicks | Only reported for posts that contain a clickable link or card. Absent otherwise |
| Watch time | Not offered by the X API |
| Media engagements / detail expands | Not broken out; included inside the X-reported engagements total |
| Followers gained from a post | Not offered. The account follower count is recorded at every sync instead |
| Promoted metrics | Only exist for promoted posts; not requested |

## Tags and classification

Every post has a topic, subtopic, content type, hook type, news flag and format. Tags are free text: the built-in lists are suggestions, and typing a new value in the tag editor creates a new tag.

Three sources, stored per post:

- `rule` - keyword rules in `src/lib/classify/rules.ts`. Applied automatically to new posts. Simple and sometimes wrong.
- `ai` - assigned by a model. With `ANTHROPIC_API_KEY` in `.env`, `npm run weekly` tags new posts automatically and `npm run classify -- --ai` does it on demand.
- `manual` - anything you edit on a post page. Manual tags are never overwritten by rules, AI or a sync. "Reset to automatic" hands the post back.

Format (Text, Image, Video, GIF, Article, Thread, Link, Mixed media) is derived from what the post contains, not from its wording. A post counts as a thread when it has two or more self-replies.

No AI key is needed for anything. Without one, new posts get rule-based tags and the weekly narrative is generated from the statistics alone.

## Analytics methodology

**Median vs average.** Reach is heavy-tailed: one viral post can multiply the average while the typical post did not change. The median is the headline number everywhere; averages are shown next to it for contrast.

**Rates.** Every rate is per impression.

- Like rate = likes / impressions (same for reply, repost, quote, bookmark, profile visit, link click)
- Engagement rate = (likes + replies + reposts + quotes + bookmarks) / impressions
- Video completion rate = plays reaching 100% / plays started

Only public interactions go into the engagement rate, so it is comparable across all posts including old ones without private metrics. A rate is empty when impressions are missing or zero, or when its numerator is unavailable. Group rates are medians of per-post rates.

**Baseline.** Rolling windows of 7, 30 and 90 days plus all time, with post count, average and median impressions, average and median engagement and like rate, and average reply, repost, bookmark and profile-visit rate. Weekly reports compare a week with the previous week and with the 30 days before it. Sample size is shown next to every aggregate, and groups with fewer than 3 posts are marked "low sample".

**Distribution score (reach).** The percentile of a post's impressions among your original posts from the 90 days before it (no look-ahead). If fewer than 8 such posts exist, all other posts are used. 50 is a typical post.

**Engagement quality score.** For each available per-impression rate (like, reply, repost, bookmark, profile visit), the post's percentile inside the same reference set; the score is the plain average of those percentiles. Equal weights, no hidden formula, and the components are shown beside the score. Unavailable rates are left out, not counted as zero.

The two scores are kept apart on purpose, so "the post was weak" can be told from "the post got low distribution relative to baseline while the people who saw it engaged more than usual".

**Outlier detection.** Runs on log10(impressions + 1) and uses the median and the median absolute deviation (MAD) of the reference set, which one viral post cannot distort:

```
robust z = 0.6745 * (value - median) / MAD
z >= 3.5  far above baseline
z >= 2    above baseline
z <= -2   below baseline
```

The "expected range" shown for a post is the 25th-75th percentile of impressions in its reference set. This describes how unusual a post was for this account. It is not a prediction model.

**Weekly narrative.** Generated from the numbers by fixed rules (`src/lib/analytics/weekly.ts`). Every line is labelled:

- `DATA` - a measured fact with its sample size
- `HYPOTHESIS` - a possible explanation, explicitly not established
- `EXPERIMENT` - something to test next week

Group-level hypotheses are only written for groups with at least 3 posts.

## Automation

Frequent snapshots give much better growth curves than a weekly pull. A good schedule is `npm run sync` a few times a day (or hourly while a post is fresh) and `npm run weekly` on Monday morning.

**Windows Task Scheduler** (run in a terminal; replace the path with your project folder):

```
schtasks /Create /TN "X Analytics sync" /SC HOURLY /MO 6 /TR "cmd /c cd /d \"C:\path\to\x-analytics\" && npm run sync >> data\sync.log 2>&1"
schtasks /Create /TN "X Analytics weekly" /SC WEEKLY /D MON /ST 09:00 /TR "cmd /c cd /d \"C:\path\to\x-analytics\" && npm run weekly >> data\weekly.log 2>&1"
```

Remove them with `schtasks /Delete /TN "X Analytics sync"`. The PC must be on at those times.

**cron** (Linux / macOS / a server):

```
0 */6 * * *  cd /path/to/x-analytics && npm run sync   >> data/sync.log 2>&1
0 9 * * 1    cd /path/to/x-analytics && npm run weekly >> data/weekly.log 2>&1
```

**GitHub Actions** works too, but the database then has to live somewhere persistent (committed to a private repo or stored as an artifact) and the four X keys go into repository secrets. Not needed for local use.

API cost: X bills about $0.001 per own post read, and re-reading the same post within one UTC day is not billed again. An incremental sync touches roughly 100 posts, so several syncs a day cost around $0.10 per day at most. Check the actual price in the X developer console.

## Claude Desktop (MCP)

The Claude Desktop chat can read this dashboard's data through a local MCP server (stdio: no web server, no open port, nothing reachable from the internet). Ask things like "how did last week go?" or "which hooks work best over 90 days?" and Claude calls the tools below.

| Tool | What it returns | X API cost |
|---|---|---|
| `get_overview` | Overview page: period totals and medians, change vs the previous period, best / lowest-reach post, followers | none |
| `list_posts` | Posts table: filters (period, week, dates, topic, format, type, hook, min impressions, text, kind) and sorting | none |
| `get_post` | One post (by id, X id or URL): full text, tags, all metrics and rates, scores and their components, snapshot history | none |
| `get_breakdown` | Content / Timing pages: groups by topic, subtopic, type, hook, format, news, time slot, weekday or hour, with n and low-sample flags | none |
| `get_weekly_report` | Weekly report as Markdown (default: last completed week; `current` for the running week) | none |
| `get_outliers` | Outliers page: posts far above / below baseline, low distribution with high engagement quality | none |
| `get_activity` | Activity page: posts per day, streaks, peak hour, top format | none |
| `get_data_status` | Last sync, recent sync runs, data-quality warnings, capability report | none |
| `run_sync` | Runs a sync (same as the Sync button) | about $0.13 per incremental run |

Setup (once): add this to `%APPDATA%\Claude\claude_desktop_config.json` (Claude Desktop: Settings → Developer → Edit Config), keeping any existing keys, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "x-analytics": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": [
        "C:/path/to/x-analytics/node_modules/tsx/dist/cli.mjs",
        "C:/path/to/x-analytics/scripts/mcp.ts"
      ]
    }
  }
}
```

Replace `C:/path/to/x-analytics` with your project folder (forward slashes work on Windows; on macOS use the output of `which node` as the command). The server reads `data/analytics.db` fresh on every call, so it always sees the latest sync; the dashboard does not need to be running. The X keys stay in `.env` and are only used by `run_sync`. Post data that Claude reads becomes part of the conversation like any pasted text.

## Secrets

- Keys live only in `.env`, which is listed in `.gitignore` together with `.env.*` and the database.
- All X API calls run server-side (CLI scripts and Next.js route handlers). Nothing under `src/components` imports the API client, and no key has a `NEXT_PUBLIC_` name, so nothing reaches the browser.
- Error messages are passed through a redaction step before they are logged or stored, and OAuth headers are never printed.

## Limitations

- **Private metrics expire.** Profile visits, link clicks, X-reported engagements and video quartiles are only served for posts up to about 30 days old. Posts older than that when tracking began will never have them. Syncing regularly keeps them for everything published from now on.
- **History starts when tracking starts.** Growth curves exist only from the first sync. Early-hours data for older posts was never collected and cannot be recovered.
- **Impressions over time are by publish date.** X does not expose account impressions per day, so the time charts show impressions earned to date by the posts published in each period.
- **Young posts are still growing.** Posts under 48 hours old at the last sync are flagged; comparisons with older posts understate them.
- **Correlation is not causation.** Topic, hook, format and timing overlap heavily in a small history. A group with a higher median is a reason to run a test, not proof that the tag caused the result. Nothing here says why X distributed a post the way it did.
- **Small samples.** With a few dozen posts, medians and percentiles move a lot. Always read the `n=` next to a number.
- **Tags are judgement calls.** Rule-based tags are rough, AI tags are better but not perfect. Correct them where it matters - every breakdown is only as good as the tags.
- **Incremental sync leaves old posts frozen.** Posts older than the sync window keep their last numbers until `npm run sync:full`.

## Project layout

```
src/lib/x/            X API client (OAuth 1.0a), payload mapping, sync
src/lib/analytics/    rates, baselines, scores, outliers, weekly report
src/lib/classify/     taxonomy, rule-based classifier, optional AI classifier
src/lib/db.ts         SQLite schema and migrations
src/app/              dashboard pages and API routes
src/components/       UI components and charts
scripts/              sync, weekly, classify, audit, import, self-test
data/                 analytics.db and backups (not committed)
reports/              weekly reports as Markdown (generated locally, not committed)
x_collect.py          the original Python collector (kept, still works, no longer needed)
```
