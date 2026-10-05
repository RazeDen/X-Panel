import { getDataset } from "@/lib/data";
import { dataWarnings } from "@/lib/warnings";
import { getDb, dbPath } from "@/lib/db";
import { aiAvailable, aiModel } from "@/lib/classify/ai";
import { formatDateTime, TZ } from "@/lib/time";
import { fmtInt } from "@/lib/format";
import { Card, Chip, Notice, PageHeader } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { MIN_SAMPLE, MATURITY_HOURS } from "@/lib/analytics/types";
import { MIN_REFERENCE, REFERENCE_DAYS } from "@/lib/analytics/scoring";
import { DEFAULT_WINDOW_DAYS } from "@/lib/x/sync";

export const dynamic = "force-dynamic";
const ORDER = ["impressions", "likes", "replies", "reposts", "quotes", "bookmarks", "profile_visits", "link_clicks", "video_views", "video_quartiles", "engagements_reported", "organic_impressions", "watch_time", "media_engagements", "followers_from_post", "promoted_metrics"];
const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | undefined; icon: string }> = {
  available: { label: "Available", tone: "good", icon: "✓" },
  partial: { label: "Partly available", tone: "warn", icon: "◐" },
  unavailable: { label: "Not returned", tone: "bad", icon: "✖" },
  not_offered: { label: "Not offered by X API", tone: undefined, icon: "—" },
};

export default function DataPage() {
  const ds = getDataset();
  const warnings = dataWarnings(ds);
  const db = getDb();
  const caps = [...ds.capabilities].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const kinds = db.prepare("SELECT kind, COUNT(*) AS n FROM posts GROUP BY kind").all() as { kind: string; n: number }[];
  const sources = db.prepare("SELECT COALESCE(class_source, 'none') AS s, COUNT(*) AS n FROM posts WHERE kind IN ('post','quote') GROUP BY 1").all() as { s: string; n: number }[];
  const reports = (db.prepare("SELECT COUNT(*) AS n FROM weekly_reports").get() as { n: number }).n;
  const ai = aiAvailable();

  return (
    <>
      <PageHeader title="Data & methods" subtitle="What is stored, what X actually returns for this account, and how every number in the dashboard is calculated." />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Sync" subtitle={`Incremental sync refreshes posts from the last ${DEFAULT_WINDOW_DAYS} days and saves a new snapshot for each. Older posts keep their last numbers until a full re-sync.`}>
          <SyncButton />
          <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <div><dt className="text-muted">Last successful sync</dt><dd className="text-ink2">{ds.lastSync ? formatDateTime(ds.lastSync) : "never"}</dd></div>
            <div><dt className="text-muted">Stored posts</dt><dd className="text-ink2">{kinds.map((k) => `${k.n} ${k.kind}`).join(", ") || "0"}</dd></div>
            <div><dt className="text-muted">Metric snapshots</dt><dd className="text-ink2">{fmtInt(ds.snapshotCount)}</dd></div>
            <div><dt className="text-muted">Follower readings</dt><dd className="text-ink2">{ds.followers.length}</dd></div>
            <div><dt className="text-muted">Saved weekly reports</dt><dd className="text-ink2">{reports}</dd></div>
            <div><dt className="text-muted">Tag sources</dt><dd className="text-ink2">{sources.map((s) => `${s.n} ${s.s}`).join(", ") || "none"}</dd></div>
            <div className="col-span-2 sm:col-span-3"><dt className="text-muted">Database file</dt><dd className="break-all font-mono text-[11px] text-ink2">{dbPath()}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted">Timezone for days, weeks and time slots: {TZ}. AI features: {ai ? `enabled (${aiModel()})` : "off - set ANTHROPIC_API_KEY in .env to enable AI tagging and the written weekly analysis"}.</p>
        </Card>

        <Card title="Data quality" subtitle="Anything that limits how far the numbers can be trusted.">
          {warnings.length ? <div className="space-y-2">{warnings.map((w) => <Notice key={w.title} tone={w.level === "error" ? "error" : w.level === "warn" ? "warn" : "info"} title={w.title}>{w.detail}</Notice>)}</div>
            : <div className="text-xs text-muted">No issues detected.</div>}
        </Card>
      </div>

      <Card className="mt-4" title="Capability report" subtitle="Which metrics X returns for your posts with the current API access. Rebuilt from stored data after every sync, so it shows what was observed, not what the documentation promises." pad={false}>
        <div className="scroll-x">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-line"><tr><th className="th">Metric</th><th className="th">Status</th><th className="th text-right">Posts with a value</th><th className="th">API field</th><th className="th">Notes</th></tr></thead>
            <tbody>
              {caps.map((c) => {
                const st = STATUS[c.status];
                return (
                  <tr key={c.key} className="border-b border-line/60 align-top last:border-0">
                    <td className="td whitespace-nowrap text-ink">{c.label}</td>
                    <td className="td whitespace-nowrap"><Chip tone={st.tone}>{st.icon} {st.label}</Chip></td>
                    <td className="td num text-right">{c.posts_checked === null ? "—" : `${c.posts_with_value} of ${c.posts_checked}`}</td>
                    <td className="td font-mono text-[11px]">{c.source ?? "—"}</td>
                    <td className="td text-xs leading-4 text-muted">{c.note ?? ""}</td>
                  </tr>
                );
              })}
              {!caps.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted">No capability data yet - run a sync.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4" title="Sync history" pad={false}>
        <div className="scroll-x">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-line"><tr><th className="th">Started</th><th className="th">Mode</th><th className="th">Status</th><th className="th text-right">Fetched</th><th className="th text-right">New</th><th className="th text-right">Updated</th><th className="th text-right">Snapshots</th><th className="th text-right">API calls</th><th className="th">Details</th></tr></thead>
            <tbody>
              {ds.runs.map((r) => {
                let warn: string[] = [];
                try { warn = JSON.parse(r.warnings ?? "[]"); } catch { /* ignore */ }
                return (
                  <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="td num whitespace-nowrap">{formatDateTime(r.started_at)}</td>
                    <td className="td whitespace-nowrap">{r.mode}</td>
                    <td className="td whitespace-nowrap"><Chip tone={r.status === "ok" ? "good" : r.status === "error" ? "bad" : "warn"}>{r.status === "ok" ? "✓ ok" : r.status === "error" ? "✖ failed" : "◐ running"}</Chip></td>
                    <td className="td num text-right">{fmtInt(r.posts_fetched)}</td><td className="td num text-right">{fmtInt(r.posts_inserted)}</td>
                    <td className="td num text-right">{fmtInt(r.posts_updated)}</td><td className="td num text-right">{fmtInt(r.snapshots_saved)}</td>
                    <td className="td num text-right">{fmtInt(r.api_requests)}</td>
                    <td className="td max-w-[380px] text-xs leading-4 text-muted">{r.error ? <span className="text-bad">{r.error}</span> : warn.join(" ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4" title="Methodology">
        <div className="grid gap-x-8 gap-y-4 text-[13px] leading-5 text-ink2 md:grid-cols-2">
          <div><h3 className="mb-1 font-medium text-ink">What counts as a post</h3><p>Analysis covers original posts and quote posts. Replies and reposts are stored and browsable but excluded from baselines, scores and reports - their reach is not comparable.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Median vs average</h3><p>Reach is heavy-tailed: one viral post can multiply the average while most posts did not change. The median (the middle post) is the headline everywhere; averages are shown beside it for contrast.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Rates</h3><p>Every rate is per impression. Engagement rate = (likes + replies + reposts + quotes + bookmarks) / impressions. A rate is blank when impressions are zero or the metric is unavailable - never zero by default. Group rates are medians of per-post rates.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Baselines</h3><p>Rolling windows of 7, 30 and 90 days plus all time. Weekly reports compare a week with the previous week and with the 30 days before it. Every comparison shows its sample size; groups under {MIN_SAMPLE} posts are marked low sample.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Distribution score</h3><p>Percentile of a post&apos;s impressions among your posts from the {REFERENCE_DAYS} days before it (all other posts if fewer than {MIN_REFERENCE}). 50 is a typical post. It measures reach only.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Engagement quality score</h3><p>Mean percentile of the available per-impression rates (like, reply, repost, bookmark, profile visit), equally weighted, against the same reference set. Kept separate from reach so a strong post with weak distribution can be told apart from a weak post.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Outliers</h3><p>Robust z-score on log10(impressions) using the median and MAD of the reference set: 2 or more is above baseline, 3.5 or more far above, -2 or less below. Descriptive only - not a prediction and not an explanation.</p></div>
          <div><h3 className="mb-1 font-medium text-ink">Limits</h3><p>Posts under {MATURITY_HOURS}h old are flagged as still accumulating. Growth curves exist only from the moment tracking started. Tag-based breakdowns are correlations: topic, hook, format and timing overlap, and nothing here establishes cause.</p></div>
        </div>
      </Card>
    </>
  );
}
