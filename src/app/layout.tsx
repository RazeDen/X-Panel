import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getDataset } from "@/lib/data";
import { dataWarnings } from "@/lib/warnings";
import { formatDateTime } from "@/lib/time";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "X Analytics", description: "Personal X analytics dashboard" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let sidebar = { account: null as string | null, lastSync: null as string | null, status: "none" as "ok" | "error" | "none", issues: 0 };
  let failure: string | null = null;
  let syncError: string | null = null;
  try {
    const ds = getDataset();
    const warnings = dataWarnings(ds);
    const last = ds.runs.find((r) => r.mode !== "legacy-import");
    sidebar = {
      account: ds.account.username,
      lastSync: ds.lastSync ? formatDateTime(ds.lastSync) : null,
      status: !last ? "none" : last.status === "error" ? "error" : "ok",
      issues: warnings.filter((w) => w.level !== "info").length,
    };
    const err = warnings.find((w) => w.level === "error");
    if (err) syncError = `${err.title}: ${err.detail}`;
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  return (
    <html lang="en">
      <body className="font-sans text-sm">
        <div className="flex min-h-screen">
          <Sidebar {...sidebar} />
          <main className="min-w-0 flex-1 px-6 py-6">
            <div className="mx-auto max-w-[1280px]">
              {failure && <div className="mb-4"><Notice tone="error" title="Could not open the database">{failure}</Notice></div>}
              {syncError && <div className="mb-4"><Notice tone="error">{syncError}</Notice></div>}
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
