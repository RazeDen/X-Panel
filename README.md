# X-Panel

A personal analytics system for one X (Twitter) account. It pulls your own posts through the X API, keeps a local history of their metrics in SQLite, tags every post (including your own content series), tracks how fast new posts grow in their first hours, compares posts against your own baseline, and shows all of it in a local dashboard styled after the X Developer Console. An MCP server lets Claude Desktop query the same data.

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

Then, on Windows, let it sync by itself (exactly at 1h / 6h / 24h after each post, every 15 minutes in between, once a day for the rest; see Automation):

```
npm run schedule:install
```

`.env` needs the four values of your X app (developer console: your app's keys and tokens). It is gitignored and never leaves your machine:

```
X_CONSUMER_KEY=
X_CONSUMER_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

## More than one account

The account behind the X API keys is the main one. More accounts can be tracked through twitterapi.io: put their handles in `.env` as `TWITTERAPI_ACCOUNTS=SecondHandle` (comma-separated) next to `TWITTERAPI_IO_KEY`, and restart the dashboard. Each account has its own database (`data/analytics-<handle>.db`), so every page, baseline and score works on one account at a time and nothing is mixed. Switch accounts with the account button at the bottom of the sidebar (remembered in the browser). The auto sync, the daily sync, comments and backups run for every account; Claude Desktop tools take an `account` argument.

Differences for a twitterapi.io account: only public metrics (impressions = X's view count, likes, replies, reposts, quotes, bookmarks); profile visits, link clicks, video views and retention are always "unavailable". twitterapi.io bills every read again (no daily de-duplication), so instead of paging through the timeline an incremental sync makes one search for posts since the last run (about $0.00015 when nothing is new) and re-reads only the stored posts of the window by id (50 per request). With the 15-minute rhythm and the first-hour / 6h / 24h captures that is about $2 a month per account; the first sync reads the whole timeline once (up to ~3,200 tweets, at most about $0.50).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dashboard on http://localhost:3000 |
| `npm run build` / `npm start` | Production build and server (faster than dev mode) |
| `npm run sync` (alias `npm run sync:x`) | Incremental sync: posts from the last 45 days. New posts are added, recent posts get fresh numbers, and one snapshot per post is appended to the history |
| `npm run sync -- --days=90` | Incremental sync with a different window |
| `npm run sync -- --account=secondhandle` | Sync one account only (`main` = the X API account); without it every account is synced |
| `npm run sync:full` | Re-reads the whole timeline (up to the 3,200 most recent posts). Use for debugging or to refresh old posts |
| `npm run sync:auto` | What the scheduled task runs every 5 minutes: syncs the last 2 days only when a post is 1h / 6h / 24h old or 15 minutes have passed |
| `npm run sync:fresh` | Sync only posts from the last 2 days, now |
| `npm run schedule:install` / `npm run schedule:remove` | Windows: register / remove the scheduled syncs (see Automation) |
| `npm run classify` | Re-applies the automatic format (series) and media type to every post (never touches a format you set by hand) |
| `npm run audit:x` | Prints the capability report: which metrics X returns for your posts |
| `npm run import:legacy` | Imports `posts_YYYY-MM-DD.json` files written by the original `x_collect.py` as historical snapshots |
| `npm test` | Self-test against a temporary database and a local mock of the X API. Spends no credits and does not touch your data |
| `npm run typecheck` | TypeScript check |
| `npm run mcp:install` | Registers the MCP server in Claude Desktop (run while Claude Desktop is closed) |

If a sync fails (no internet, rate limit, bad keys), it says so and changes nothing. Nothing is ever deleted.

## The dashboard

| Page | What it shows |
|---|---|
| Overview | YouTube-style "Latest post performance" card (preview, age, first-hour impressions with an up / down arrow vs your median and a first-hour meter, engagement rate vs posts of similar reach, paging through the last 10 posts; no bookmark rate or rank row), headline cards with change vs the previous period, your series compared, impressions and engagement rate over time, current vs previous week, best and worst post, biggest outliers, rolling account baseline, follower count |
| Activity | Calendar heatmap of posts per day, streaks, most common posting hour and format |
| Posts | Searchable, sortable table of your original posts (replies, reposts and articles are not listed) with a thumbnail, rank (#), format (series - changeable right in the table with a dropdown, saved as your choice) and first-hour impressions; posts under 48h old carry a green "new" chip. Filters: date range, week, format, minimum impressions, text. Toggle between counts and per-impression rates. The eye icon at the end of a row hides the post (see "Hidden posts"); a "Hidden" tab lists hidden posts with a Restore button |
| Comments | Replies by other accounts to your posts from the last 30 hours that you have not answered yet (older unanswered ones drop off; tabs: To answer / Answered / Hidden): author avatar and name, the comment, the post it is on with its thumbnail, and buttons **Draft in Claude** (copies the post and the comment; paste them into your own Claude chat whose instructions set your voice, and it answers with one reply), **Open on X** and **Hide** (spam; never deleted, Restore brings it back). A comment leaves the list once you have answered it: right away on **Check now** (it also looks up your latest replies), otherwise by itself once your reply is synced (about 15 minutes). The sidebar shows how many are waiting |
| Post detail | Hide / Restore button, full text, link to X, editable tags and series, metric cards, the two scores, early performance (impressions at 1h / 6h / 24h against your other posts at the same age) and rank, rates against your baseline, growth curve from snapshots, video retention, similar posts |
| Content | Performance grouped by format (series) |
| Patterns | Formats, time slots and days by median views over 7 / 30 / 90 days or all time, plus the formats with the highest bookmark, repost and engagement rates |
| Outliers | Posts far above or below your own baseline, a reach-vs-quality chart, and posts with low distribution but high engagement quality |
| Data & methods | Sync button, data-quality warnings, capability report, sync history, methodology |

Filters live in the URL, so any view can be bookmarked. Charts are clickable: a bar opens the posts behind it, a dot opens the post.

## Data model

One SQLite file: `data/analytics.db`. Tables:

- `posts` - one row per post: X id, URL, full text (long-post body and article text included), timestamps (`created_at`, `first_seen_at`, `last_synced_at`), structure (kind, media, links, thread / quote flags), labels (`series` = format and `series_source` = rule or manual, `format` = media type; the old `topic`, `subtopic`, `content_type`, `hook_type`, `is_news` columns are kept but no longer used), the preview image of the first media item (`media_preview`), the latest metrics, and the derived rates.
- `metric_snapshots` - the history. Every sync appends one row per post with the metrics at that moment. Nothing is overwritten, so growth curves build up over time.
- `account_snapshots` - follower / following / post counts at every sync.
- `sync_runs` - a log of every sync: mode, status, counts, API calls, warnings, error message.
- `capabilities` - which metrics X actually returned, rebuilt after every sync.
- `weekly_reports` - left over from the removed weekly-report feature; kept, no longer written.
- `meta` - last successful sync, account handle.

- `comments` - replies by other accounts to your posts and replies, read through twitterapi.io: text, author (id, handle, name, avatar), the post it answers, likes, `hidden_at`. Never deleted; "answered" comes from your own replies in `posts`, or from `my_reply_id` / `my_reply_text` / `my_reply_url`, set when "Check now" finds your reply.

`posts.hidden_at` is set when you hide a post (see below) and cleared when you restore it.

A metric X does not return is stored as `NULL` and shown as a dash. It is never turned into 0. Posts and snapshots are never deleted: a post that stops appearing in the API is only flagged (`missing_since`).

**Hidden posts.** "Delete" in the dashboard means hide: the post disappears from the Posts table and from every number (baselines, medians, scores, ranks, outliers, activity, the Overview, and the Claude Desktop tools), but nothing is removed from the database. Its snapshots stay, sync keeps updating it, and Restore (Posts → Hidden tab, or the post page) brings it back with its full history. The post is not touched on X. Data & methods shows how many posts are hidden.

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

Each post has two labels used for comparisons, both derived automatically from the post itself. Topic, content type, hook and the news flag were removed on 2026-10-07, and the bait / no-bait comparison on 2026-10-29: they are no longer derived, shown or counted anywhere (old values stay in the database, unused).

Three sources, stored per post:

- The format can be changed on a post page; your choice is never overwritten by a sync, and "Reset to automatic" hands the post back.

Format (Text, Image, Video, GIF, Article, Thread, Link, Mixed media) is derived from what the post contains, not from its wording. A post counts as a thread when it has two or more self-replies.

**Series** is the account owner's content line, the main thing to compare: `Animated file` (an animated post built around a file, config, prompt or rule set) and `Animated scene` (an animation where something happens), everything else `Other`. It is detected from the headline of video / GIF posts (`deriveSeries` in `src/lib/classify/rules.ts`, reading only the first line up to the first " - "); a series you pick on a post page is kept and never overwritten. Edit the keyword lists there to fit your own series. Each account can have its own set (`seriesScheme` in `src/lib/accounts.ts`): the second account uses `Animated file` / `Lectures` / `Other`, where `Lectures` is any video of 5 minutes or more (talks, courses, workshops) and a shorter video with a file headline is `Animated file`. Pages, filters and Claude Desktop show each account's own set.



## Analytics methodology

**Median vs average.** Reach is heavy-tailed: one viral post can multiply the average while the typical post did not change. The median is the headline number everywhere; averages are shown next to it for contrast.

**Rates.** Every rate is per impression.

- Like rate = likes / impressions (same for reply, repost, quote, bookmark, profile visit, link click)
- Engagement rate = (likes + replies + reposts + quotes + bookmarks) / impressions
- Video completion rate = plays reaching 100% / plays started

Only public interactions go into the engagement rate, so it is comparable across all posts including old ones without private metrics. A rate is empty when impressions are missing or zero, or when its numerator is unavailable. Group rates are medians of per-post rates.

**Baseline.** Rolling windows of 7, 30 and 90 days plus all time, with post count, average and median impressions, average and median engagement and like rate, and average reply, repost, bookmark and profile-visit rate. Period cards compare with the previous period of equal length. Sample size is shown next to every aggregate, and groups with fewer than 3 posts are marked "low sample".

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

**Early performance and rank** (`src/lib/analytics/growth.ts`). Impressions at a given age (1h, 6h, 24h) come only from stored snapshots:

- measured - a sync ran close to that age (within 10%, at least 7.5 minutes);
- estimated (shown with ≈) - interpolated between the two snapshots around that age, only when they are at most max(30 min, 35% of the age) apart; the moment of publishing counts as 0;
- otherwise "not captured" - never a guess.

The rank in the Posts table and on post pages is by total impressions among all original posts.

**Verdict icons.** Two kinds, both with a tooltip naming the comparison and its n:

- first hour, 6h, 24h - green up / red down arrow = above / below the **median** of your other posts at the same age. Shown from one comparison post; with fewer than 3 the sample size is printed next to the arrow;
- impressions on the latest-post card - green check = within the 25th-75th percentile of the other recent posts, up / down = above / below it. Nothing is shown with fewer than 3 comparison posts, and a post that is still growing is not judged against finished totals;
- engagement rate on the latest-post card - up / down = above / below the median engagement rate of your 15 posts with the most similar impressions (closest on a log scale). Engagement rate falls as reach grows, so a 10K post is only compared with other big posts and a 500-impression post with small ones (`similarReach` in `growth.ts`).

**First-hour meter.** A thin line under the first-hour row of the latest-post card: the post's first-hour impressions as a bar (red when below the median), the range of your other recent posts' first hours as a grey band, and their median as a white tick, with the median and n underneath.

## Automation

First-hour, 6h and 24h numbers only exist if a sync runs at those ages, so the sync runs by itself.

**Windows:** `npm run schedule:install` registers two Task Scheduler tasks for your user (`scripts/schedule-sync.ps1`):

- `X-Panel auto sync` - every 5 minutes runs `npm run sync:auto`, which calls X only when a post from the last 25 hours is 1 hour, 6 hours or 24 hours old (within 2.5 minutes) and has no snapshot at that age yet, or when the last sync was 15 minutes ago (that regular sync also finds new posts). Otherwise it logs one "skip" line. It reads posts from the last 2 days;
- `X-Panel daily sync` - every day at 08:00, the normal 45-day sync.

They run hidden (no window pops up), skip a run while the previous one is still going, and append to `data/sync.log` (rotated at 5 MB). They run only while you are logged on and the PC is on. Remove them with `npm run schedule:remove`.

**cron** (Linux / macOS / a server):

```
*/5 * * * *   cd /path/to/x-analytics && npm run sync:auto >> data/sync.log 2>&1
0 8 * * *     cd /path/to/x-analytics && npm run sync       >> data/sync.log 2>&1
```

**GitHub Actions** works too, but the database then has to live somewhere persistent (committed to a private repo or stored as an artifact) and the four X keys go into repository secrets. Not needed for local use.

API cost: X bills about $0.001 per own post read and $0.01 per profile lookup, and re-reading the same resource within one UTC day is not billed again. So the 15-minute schedule costs about the same as one sync a day: roughly $0.15 per day (about $4.50 a month) for a ~120-post window. Check the actual price in the X developer console.

**Comments (twitterapi.io):** set `TWITTERAPI_IO_KEY` in `.env` (optional). The X API would bill $0.005 per comment plus $0.01 per author profile; twitterapi.io returns comments with the author's name and avatar for about $0.15 per 1,000 (minimum $0.00015 per request, even when empty). So the 5-minute auto sync asks for comments only when the reply counts of your posts from the last 14 days changed since the last check (those counts come with the normal post sync), or once an hour as a fallback for replies deeper in a thread, and only for mentions newer than the last check. The first check reads the last 7 days. At ~15 comments a day that is well under $1 a month. "Check now" on the Comments page asks right away and then makes one search for your own tweets since the oldest open comment (or the previous check), so comments you have answered leave the list at once (one request plus $0.00015 per tweet returned; no request when nothing is open). Drafting answers costs nothing extra: "Draft in Claude" only copies text for your own Claude chat.

## Running on a server (24/7)

The dashboard, the sync timers and the MCP server can live on a small Linux VPS so the first-hour capture never misses a post while your PC sleeps. `deploy/` holds everything for Ubuntu with systemd:

| Unit | What it does |
|---|---|
| `x-panel-web.service` | `next start` on `127.0.0.1:3000` as the `xpanel` user, restarted on failure and on boot. Not reachable from the internet |
| `x-panel-auto-sync.timer` | Every 5 minutes runs `scripts/auto-sync.ts` (calls X only when a post is 1h / 6h / 24h old or 15 minutes have passed) |
| `x-panel-daily-sync.timer` | Daily 45-day sync at 08:00 Europe/Warsaw |
| `x-panel-backup.timer` | Daily `scripts/backup-db.ts` at 03:30 (SQLite online backup, newest 14 kept in `data/backups/`) |

Setup outline (Ubuntu 24.04): install Node 22 LTS, create a system user `xpanel` with home `/opt/x-panel`, put the repository in `/opt/x-panel/app`, copy `.env` (mode 600) and `data/analytics.db`, run `npm ci && npm run build` as `xpanel`, copy the units to `/etc/systemd/system/` and `systemctl enable --now` them. Logs: `journalctl -u x-panel-auto-sync -u x-panel-web`.

**Access:** install Tailscale on the server and your PC (same account) and run `tailscale serve --bg --http 80 http://127.0.0.1:3000` on the server. The dashboard is then at `http://<machine-name>` (MagicDNS) from your devices only; nothing is opened on the public IP.

**Updating:** after changing the code on the server, `sh /opt/x-panel/app/deploy/update.sh` (as root) fixes ownership, reinstalls dependencies when the lockfile changed, typechecks, builds and restarts the dashboard.

**MCP from Claude Desktop:** quit Claude Desktop and run `npm run mcp:install -- --ssh root@<server>` on the PC. Claude Desktop then starts `scripts/mcp-remote.sh` on the server over SSH (key login required), which runs the MCP server as `xpanel` against the server's database.

## Claude Desktop (MCP)

The Claude Desktop chat can read this dashboard's data through a local MCP server (stdio: no web server, no open port, nothing reachable from the internet). Ask things like "how did last week go?" or "which format works best over 90 days?" and Claude calls the tools below.

| Tool | What it returns | X API cost |
|---|---|---|
| (all tools) | Optional `account` (`main` or an extra account's handle in lower case); each account's data is separate | - |
| `get_overview` | Overview page: period totals and medians, change vs the previous period, best / lowest-reach post, followers | none |
| `list_posts` | Posts table: filters (period, week, dates, format (series), media type, min impressions, text, kind) and sorting; every row carries format and rank. Hidden posts are left out | none |
| `get_post` | One post (by id, X id or URL, hidden ones included and flagged `hidden`): full text, tags and series, all metrics and rates, scores and their components, rank, early performance (1h / 6h / 24h vs other posts), snapshot history | none |
| `get_recent_performance` | The latest-post cards for the last N posts: age, rank (same age or total), first-hour impressions vs the median of other recent posts, verdicts for impressions, engagement and bookmark rate | none |
| `get_breakdown` | Content page and posting-time groups: groups by format (series), media type, time slot, weekday or hour, with n and low-sample flags | none |
| `get_outliers` | Outliers page: posts far above / below baseline, low distribution with high engagement quality | none |
| `get_activity` | Activity page: posts per day, streaks, peak hour, top format | none |
| `list_comments` | Comments page: comments to answer (or answered / hidden) with author, text and the post they are on, plus your recent replies as a style sample, so Claude can draft answers in your voice | none |
| `get_data_status` | Last sync, recent sync runs, data-quality warnings, stored and hidden post counts, capability report | none |
| `run_sync` | Runs a sync (same as the Sync button) | about $0.13 per incremental run |

Setup (once, and again after moving the project folder):

1. Quit Claude Desktop completely (tray icon → Quit). It keeps its config in memory and overwrites the file when it saves its own settings, so an entry added while it runs gets lost.
2. In a terminal in the project folder run `npm run mcp:install`. It refuses to run while Claude Desktop is open, backs the config up, and adds only `mcpServers.x-analytics` with the paths of this folder.
3. Start Claude Desktop. In a chat, the tools appear under the tools menu as `x-analytics`.

The entry it writes looks like this (to add it by hand, edit `%APPDATA%\Claude\claude_desktop_config.json` while Claude Desktop is closed):

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
- **History starts when tracking starts.** Growth curves exist only from the first sync. Early-hours data (first hour, same-age ranks) exists only for posts published while the scheduled sync was running; for older posts it was never collected and cannot be recovered.
- **Impressions over time are by publish date.** X does not expose account impressions per day, so the time charts show impressions earned to date by the posts published in each period.
- **Young posts are still growing.** Posts under 48 hours old at the last sync are flagged; comparisons with older posts understate them.
- **Correlation is not causation.** Format and timing overlap heavily in a small history. A group with a higher median is a reason to run a test, not proof that the label caused the result. Nothing here says why X distributed a post the way it did.
- **Small samples.** With a few dozen posts, medians and percentiles move a lot. Always read the `n=` next to a number.
- **The format is detected from the headline.** It is rough; correct it on the post page where it matters - every format breakdown is only as good as the labels.
- **Incremental sync leaves old posts frozen.** Posts older than the sync window keep their last numbers until `npm run sync:full`.

## Project layout

```
src/lib/x/            X API client (OAuth 1.0a), payload mapping, sync
src/lib/analytics/    rates, baselines, scores, outliers, activity, early growth
src/lib/classify/     format (series) and media-type rules, manual format store
src/lib/mcp/          MCP server tools for Claude Desktop
src/lib/db.ts         SQLite schema and migrations
src/app/              dashboard pages and API routes
src/components/       UI components and charts
scripts/              sync, schedule, classify, audit, import, MCP, self-test
data/                 analytics.db, backups and sync.log (not committed)
x_collect.py          the original Python collector (kept, still works, no longer needed)
```
