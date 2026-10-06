"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/* Outline icons drawn on a 24px grid, rendered at 16px like the Developer Console nav. */
const ICONS: Record<string, ReactNode> = {
  "/": <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  "/activity": <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2" /></>,
  "/posts": <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>,
  "/content": <path d="M12 3 2.5 8 12 13l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5" />,
  "/timing": <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  "/patterns": <path d="M5 20V11M11 20V4M17 20v-7M22 20H2" />,
  "/outliers": <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  "/data": <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
};

const GROUPS: { label: string | null; items: { href: string; label: string }[] }[] = [
  { label: null, items: [{ href: "/", label: "Overview" }, { href: "/activity", label: "Activity" }, { href: "/posts", label: "Posts" }] },
  { label: "Analysis", items: [{ href: "/content", label: "Content" }, { href: "/timing", label: "Timing" }, { href: "/patterns", label: "Patterns" }, { href: "/outliers", label: "Outliers" }] },
  { label: "System", items: [{ href: "/data", label: "Data & methods" }] },
];

export function Sidebar({ account, name, avatar, lastSync, status, issues }: {
  account: string | null; name: string | null; avatar: string | null; lastSync: string | null; status: "ok" | "error" | "none"; issues: number;
}) {
  const path = usePathname();
  const statusLabel = `${status === "ok" ? "Last sync ok" : status === "error" ? "Last sync failed" : "Never synced"}${lastSync ? ` · ${lastSync}` : ""}`;
  return (
    <aside className="panel flex w-[240px] shrink-0 flex-col overflow-hidden">
      <Link href="/" className="hatch flex items-center gap-3 px-5 pb-4 pt-5">
        <Logo size={30} />
        <div className="text-[14px] font-semibold leading-[17px] text-ink">X Analytics<div className="font-normal text-muted">Console</div></div>
      </Link>
      <nav className="scroll-y flex-1 px-3 pb-3">
        {GROUPS.map((g, gi) => (
          <div key={gi} className={gi ? "mt-2 border-t border-line pt-3" : "pt-2"}>
            {g.label && <div className="mb-1 px-3 text-[12px] text-muted">{g.label}</div>}
            {g.items.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={`relative flex h-8 items-center gap-2.5 rounded-control px-3 text-[13.5px] transition-colors duration-150 ease-console ${active ? "font-semibold text-ink" : "text-ink2 hover:bg-white/5 hover:text-ink"}`}>
                  {active && <span aria-hidden className="absolute -left-1 bottom-1.5 top-1.5 w-[2px] rounded-full bg-ink" />}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {ICONS[n.href]}
                  </svg>
                  <span className="flex-1">{n.label}</span>
                  {n.href === "/data" && issues > 0 && <span className="num rounded-control bg-raised px-1.5 text-[11px] leading-5 text-warn" title={`${issues} data-quality warning(s)`}>{issues}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="hatch flex items-center gap-2.5 border-t border-line px-5 py-3.5">
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full" />
          : <div aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-ink">{(name ?? account ?? "?").charAt(0).toUpperCase()}</div>}
        <div className="min-w-0 flex-1 truncate text-[13.5px] text-ink" title={account ? `@${account}` : undefined}>{name ?? (account ? `@${account}` : "No account")}</div>
        <span role="img" aria-label={statusLabel} title={statusLabel}
          className={`h-2 w-2 shrink-0 rounded-full ${status === "ok" ? "bg-good" : status === "error" ? "bg-bad" : "bg-muted"}`} />
      </div>
    </aside>
  );
}
