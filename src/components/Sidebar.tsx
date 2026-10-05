"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/posts", label: "Posts" },
  { href: "/content", label: "Content" },
  { href: "/timing", label: "Timing" },
  { href: "/weekly", label: "Weekly report" },
  { href: "/patterns", label: "Patterns" },
  { href: "/outliers", label: "Outliers" },
  { href: "/data", label: "Data & methods" },
];

export function Sidebar({ account, lastSync, status, issues }: { account: string | null; lastSync: string | null; status: "ok" | "error" | "none"; issues: number }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <div className="text-[13px] font-semibold tracking-tight text-ink">X Analytics</div>
        <div className="mt-0.5 text-xs text-muted">{account ? `@${account}` : "no account synced"}</div>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${active ? "bg-raised font-medium text-ink" : "text-ink2 hover:bg-raised/60 hover:text-ink"}`}>
              {n.label}
              {n.href === "/data" && issues > 0 && <span className="num rounded bg-warn/15 px-1.5 text-[10px] font-medium text-warn">{issues}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-4 py-3 text-xs leading-5 text-muted">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${status === "ok" ? "bg-good" : status === "error" ? "bg-bad" : "bg-muted"}`} />
          {status === "ok" ? "Last sync ok" : status === "error" ? "Last sync failed" : "Never synced"}
        </div>
        <div className="num">{lastSync ?? "—"}</div>
      </div>
    </aside>
  );
}
