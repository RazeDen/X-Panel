import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { SyncButton } from "@/components/SyncButton";
import { getDataset } from "@/lib/data";
import { dataWarnings } from "@/lib/warnings";
import { formatDateTime } from "@/lib/time";
import { Notice } from "@/components/ui";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = { title: "X Analytics", description: "Personal X analytics dashboard" };
export const dynamic = "force-dynamic";

const ExternalArrow = () => (
  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M5 11 11 5M6 5h5v5" /></svg>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let sidebar = { account: null as string | null, name: null as string | null, avatar: null as string | null, lastSync: null as string | null, status: "none" as "ok" | "error" | "none", issues: 0 };
  let failure: string | null = null;
  let syncError: string | null = null;
  try {
    const ds = getDataset();
    const warnings = dataWarnings(ds);
    const last = ds.runs.find((r) => r.mode !== "legacy-import");
    sidebar = {
      account: ds.account.username,
      name: ds.account.name,
      avatar: ds.account.avatar,
      lastSync: ds.lastSync ? formatDateTime(ds.lastSync) : null,
      status: !last ? "none" : last.status === "error" ? "error" : "ok",
      issues: warnings.filter((w) => w.level !== "info").length,
    };
    const err = warnings.find((w) => w.level === "error");
    if (err) syncError = `${err.title}: ${err.detail}`;
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  const statusText = sidebar.status === "ok" ? "Synced" : sidebar.status === "error" ? "Last sync failed" : "Never synced";
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="h-screen overflow-hidden bg-page font-sans text-sm">
        {/* Console layout: two floating panels on a black canvas. */}
        <div className="flex h-full gap-3 p-3">
          <Sidebar {...sidebar} />
          <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden bg-page">
            <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
              <div className="truncate text-[14px] text-ink">{sidebar.account ?? "x-analytics"}</div>
              <div className="flex items-center gap-5 text-[13px] text-ink2">
                {sidebar.account && <a href={`https://x.com/${sidebar.account}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-ink">Profile <ExternalArrow /></a>}
                <a href="https://docs.x.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-ink">API docs <ExternalArrow /></a>
                <span aria-hidden className="h-5 w-px bg-line" />
                <span className="hidden items-center gap-1.5 text-[12px] text-muted lg:inline-flex" title={sidebar.lastSync ?? undefined}>
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${sidebar.status === "ok" ? "bg-good" : sidebar.status === "error" ? "bg-bad" : "bg-muted"}`} />
                  {statusText}{sidebar.lastSync ? ` ${sidebar.lastSync}` : ""}
                </span>
                <SyncButton variant="topbar" />
              </div>
            </header>
            <main className="scroll-y min-h-0 flex-1" style={{ backgroundImage: "var(--canvas-sheen)" }}>
              <div className="mx-auto max-w-[1240px] px-8 pb-12 pt-8">
                {failure && <div className="mb-4"><Notice tone="error" title="Could not open the database">{failure}</Notice></div>}
                {syncError && <div className="mb-4"><Notice tone="error">{syncError}</Notice></div>}
                {children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
