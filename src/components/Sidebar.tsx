"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "./Logo";

/* Outline icons drawn on a 24px grid, rendered at 16px like the Developer Console nav. */
const ICONS: Record<string, ReactNode> = {
  "/": <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  "/activity": <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2" /></>,
  "/comments": <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5zM8 8.5h8M8 12h5" />,
  "/posts": <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>,
  "/content": <path d="M12 3 2.5 8 12 13l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5" />,
  "/patterns": <path d="M5 20V11M11 20V4M17 20v-7M22 20H2" />,
  "/outliers": <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  "/data": <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
};

const GROUPS: { label: string | null; items: { href: string; label: string }[] }[] = [
  { label: null, items: [{ href: "/", label: "Overview" }, { href: "/activity", label: "Activity" }, { href: "/posts", label: "Posts" }, { href: "/comments", label: "Comments" }] },
  { label: "Analysis", items: [{ href: "/content", label: "Content" }, { href: "/patterns", label: "Patterns" }, { href: "/outliers", label: "Outliers" }] },
  { label: "System", items: [{ href: "/data", label: "Data & methods" }] },
];

export interface AccountChoice { key: string; username: string | null; name: string | null; avatar: string | null }

function Avatar({ src, label, size = 24 }: { src: string | null; label: string; size?: number }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} />
    : <div aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-ink" style={{ width: size, height: size }}>{label.charAt(0).toUpperCase()}</div>;
}

/**
 * Sidebar footer: the current account; with more than one account it opens a menu to switch (saved in a
 * cookie by /api/account). A post page belongs to one account, so switching there goes back to the list.
 */
function AccountSwitcher({ current, choices, statusDot }: { current: AccountChoice; choices: AccountChoice[]; statusDot: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const label = (c: AccountChoice) => c.name ?? (c.username ? `@${c.username}` : "Main account");
  async function pick(key: string) {
    setOpen(false);
    if (key === current.key) return;
    setBusy(true);
    try {
      await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
      if (/^\/posts\/[^/]+/.test(path)) router.push("/posts");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  const multi = choices.length > 1;
  return (
    <div ref={ref} className="relative border-t border-line">
      {open && (
        <div role="menu" className="absolute inset-x-2 bottom-full mb-2 rounded-[10px] border border-line bg-surface p-1 shadow-[0_8px_24px_-8px_#000000e6]">
          <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Accounts</div>
          {choices.map((c) => (
            <button key={c.key} type="button" role="menuitemradio" aria-checked={c.key === current.key} onClick={() => void pick(c.key)}
              className="flex h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-left transition-colors hover:bg-white/5">
              <Avatar src={c.avatar} label={label(c)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{label(c)}</span>
                {c.username && <span className="block truncate text-[11px] leading-3 text-muted">@{c.username}</span>}
              </span>
              {c.key === current.key && <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>}
            </button>
          ))}
        </div>
      )}
      <button type="button" disabled={!multi || busy} onClick={() => setOpen((v) => !v)} aria-haspopup={multi ? "menu" : undefined} aria-expanded={multi ? open : undefined}
        title={multi ? "Switch account" : undefined}
        className={`hatch flex w-full items-center gap-2.5 px-5 py-3.5 text-left ${multi ? "transition-colors hover:bg-white/5" : "cursor-default"}`}>
        <Avatar src={current.avatar} label={label(current)} />
        <div className={`min-w-0 flex-1 truncate text-[13.5px] text-ink ${busy ? "opacity-50" : ""}`} title={current.username ? `@${current.username}` : undefined}>{label(current)}</div>
        {multi && <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>}
        {statusDot}
      </button>
    </div>
  );
}

export function Sidebar({ account, name, avatar, lastSync, status, issues, comments = 0, accountKey = "main", choices = [] }: {
  account: string | null; name: string | null; avatar: string | null; lastSync: string | null; status: "ok" | "error" | "none"; issues: number;
  /** Comments waiting for an answer. */
  comments?: number;
  /** The selected account and every account that can be picked. */
  accountKey?: string;
  choices?: AccountChoice[];
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
                  {n.href === "/comments" && comments > 0 && <span className="num rounded-control bg-raised px-1.5 text-[11px] leading-5 text-ink2" title={`${comments} comment(s) to answer`}>{comments}</span>}
                  {n.href === "/data" && issues > 0 && <span className="num rounded-control bg-raised px-1.5 text-[11px] leading-5 text-warn" title={`${issues} data-quality warning(s)`}>{issues}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <AccountSwitcher
        current={{ key: accountKey, username: account, name, avatar }}
        choices={choices.length ? choices : [{ key: accountKey, username: account, name, avatar }]}
        statusDot={<span role="img" aria-label={statusLabel} title={statusLabel} className={`h-2 w-2 shrink-0 rounded-full ${status === "ok" ? "bg-good" : status === "error" ? "bg-bad" : "bg-muted"}`} />} />
    </aside>
  );
}
