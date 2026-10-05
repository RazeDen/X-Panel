# DESIGN.md - X Developer Console style

The dashboard copies the look of the **X Developer Console** (console.x.com, dark theme). Token values below were taken from the console's own CSS (its `--console-*` and `--x-*` variables), not eyeballed. Every new page, component or chart must follow this file. Reuse the classes and components listed here; if something new is truly needed, add it here first.

## Principles

- Black canvas with two floating panels (sidebar, main), each with a 1px border and a soft inner highlight.
- Neutral greys, not blue-tinted. White is the primary action colour; X blue is for data, links and focus.
- Quiet typography: Inter, medium-weight headings, small grey labels, semibold numbers. No uppercase.
- Small radii: panels 14px, cards 10px, controls 6px. Nothing pill-shaped except dots and avatars.
- Fast, subtle motion: 150ms with the console easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- Direction is never shown by colour alone: always an arrow (`↑` / `↓`) or text next to the colour.

## Tokens (`src/app/globals.css`; Tailwind name in brackets; console source variable)

| Token | Value | Console source | Use |
|---|---|---|---|
| page (`bg-page`) | `#000000` | `--console-canvas` | Canvas behind the panels, main panel body |
| surface (`bg-surface`) | `#0a0a0a` | `--console-surface` | Sidebar panel, cards, inputs |
| sunken (`bg-sunken`) | `#141414` | `--console-sunken` | Insets, tooltips, code blocks |
| raised (`bg-raised`) | `#1f1f1f` | gray-300 | Active segment, chips, empty heatmap cells |
| line (`border-line`) | `#1f1f1f` | `--console-line` | All borders and dividers |
| line-strong (`border-line-strong`) | `#333333` | `--x-border-hover` | Hovered borders |
| ink (`text-ink`) | `#ededed` | `--x-fg-primary` | Primary text and numbers |
| ink-2 (`text-ink2`) | `#a1a1a1` | `--x-fg-secondary` | Nav items, labels, secondary text |
| muted (`text-muted`) | `#737373` | `--x-fg-tertiary` | Descriptions, axis ticks, group labels, zero values |
| hover wash | `white/5` (`#ffffff0d`) | `--console-wash` | Hover background on nav items and ghost buttons |
| accent (`text-accent`) | `#1d9bf0` | `--x-blue-500` | Chart series 1, links, info icons |
| good | `#00ba7c` | `--x-green-500` | Positive change, ok status |
| bad | `#f4212e` | `--x-red-500` | Negative change, errors |
| warn | `#ffd400` | `--x-yellow-500` | Warnings, low sample |
| series 1-4 | `#1d9bf0`, `#737373`, `#00ba7c`, `#ffd400` | - | Chart series in this order (current = blue, comparison = grey) |
| grid | `#1a1a1a` | - | Horizontal chart grid lines |
| elevation | `inset 0 1px 0 #ffffff0b, 0 1px 2px #00000080` | `--console-elevation` | Cards (`.card`) |
| panel shadow | `inset 0 1px 0 #ffffff0e, 0 18px 44px -22px #000000e6` | `--console-panel-shadow` | Panels (`.panel`) |
| canvas sheen | `linear-gradient(180deg, #ffffff09, #fff0 280px)` | `--console-canvas-sheen` | Top of the main scroll area |

Sequential ramps (e.g. the Timing grid) use the X blue scale: `#00154a #003886 #005ac2 #006fd6 #0083eb #1d9bf0 #43b3f6 #6bc9fb`. Never hard-code other hex values in components.

Fonts: **Inter** (`--font-inter`) for text and **Geist Mono** (`--font-geist-mono`) for IDs and code, loaded with `next/font/google` in `layout.tsx`. Tabular figures are on by default (`"tnum"`). Note: `next/font/google` downloads the fonts on first build/dev start, so that needs internet once.

## Type scale

| Element | Style |
|---|---|
| Page title | 22px, `font-medium`, tight tracking (console "Hello, RazeDen") |
| Page subtitle | 13px, `text-ink2` |
| Card title | 14px `font-semibold`, with the description inline after it: 12px `text-muted` |
| Stat label | 12px `text-ink2` (`.label`) |
| Stat value | 26px `font-semibold`; shown in `text-muted` when it is zero / empty (console "$0.00") |
| Body, table cells, nav | 13-13.5px |
| Group labels, meta, axis ticks | 11-12px `text-muted` |

## Layout (`src/app/layout.tsx`)

- `body` is the black canvas, `p-3`, `gap-3`, full viewport height; only the main panel scrolls.
- **Sidebar panel** (`.panel`, 240px): hatched header with the logo and "X Analytics / Console"; nav groups (none, Analysis, Reports, System) separated by `border-t`, group labels 12px muted; hatched footer with avatar, name and the sync status dot.
- **Main panel** (`.panel bg-page`): 56px top bar with `border-b` - account handle on the left; `Profile ↗`, `API docs ↗`, a divider, the last-sync status and the white **Sync now** button on the right (console "Buy Credits" position). Below it the scroll area with the canvas sheen; content `max-w-[1240px] px-8 pt-8`.
- Page order: `PageHeader` → filter row (segmented range + dropdowns) → stat tiles (`gap-3`, 6 per row on xl) → cards (`gap-4`).

## Components (use these)

| Need | Use |
|---|---|
| Page heading | `PageHeader` (`src/components/ui.tsx`); section switching goes in its `tabs` slot |
| Section tabs | `UrlTabs variant="underline"`: 13px labels, active `text-ink font-medium` with a 2px white bar on the bottom border |
| Range / view toggles | `.seg` + `.seg-item` / `.seg-active` (black track, `#1f1f1f` active segment), or `UrlTabs` (default), or `FilterBar` range |
| Dropdown | `<select className="input">`: 32px high, 6px radius, `bg-surface`, border brightens on hover |
| Card | `Card` / `.card`: 10px radius, `border-line`, `bg-surface`, elevation shadow; inner sections separated by `border-t border-line` |
| Floating panel | `.panel` |
| Metric tile | `StatCard`: grey label, big number, `Delta` + context line below |
| Change indicator | `Delta` (`↑280%` green / `↓44%` red, then muted context) |
| Primary button | `.btn .btn-primary` - white, black text, 6px radius, optional 14px icon (console "Buy Credits") |
| Secondary button | `.btn` - transparent with border |
| Icon-only button | `.icon-btn` |
| Blue action | `.btn .btn-accent` (rare) |
| Hatched texture | `.hatch` (-45deg, 1px white at 3.5%, every 7px): sidebar header/footer, empty states, promo rows |
| Tag / small label | `.chip` (6px radius, `bg-raised`) |
| Notice / tip | `Notice`: 10px radius card, icon in accent (info), warn or bad colour |
| Empty state | `Empty` (hatched, centered muted text) |
| Sample size | `N` - always next to aggregates |
| Charts | `BarsChart`, `LinesChart`, `QuadrantChart` (`src/components/charts.tsx`) |
| Calendar heatmap | `Heatmap`: accent blue at 30 / 55 / 80 / 100% for levels 1-4, `bg-raised` for zero |
| Sync | `SyncButton variant="topbar"` in the top bar; full version (incremental + full re-sync) on Data & methods |
| Logo | `Logo` (`src/components/Logo.tsx`), favicon `src/app/icon.svg` |

## Charts

- Bars in series colours, 2px rounded tops, `maxBarSize` 40; horizontal grid only, no axis lines; ticks 11px muted, compact numbers (`50K`).
- Legend (2+ series): top-left, `● label` - 6px coloured dot and 12px grey text, like the console's "● Post" selector.
- Tooltip: `bg-sunken`, 8px radius, `border-line`, console hint shadow.
- Outliers: above = good green, below = bad red, typical = blue.
- Clickable marks open the posts behind them (`href` on the row).

## Sidebar nav

- Items: 32px high, 6px radius, 16px outline icon (24px grid, `stroke="currentColor"`, 1.8 stroke) + 13.5px label in `text-ink2`; hover = white/5 wash and `text-ink`.
- Active item: `text-ink font-semibold`, icon stroke 2.2, and a 2px white bar at the left edge.
- Counts (e.g. data warnings) as a small `bg-raised` badge on the right.

## Don't

- No blue-tinted greys, no gradients other than the canvas sheen, no glow.
- No pill-shaped buttons or toggles, no uppercase / letter-spaced labels, no extra-bold headings.
- No new colours for decoration, no colour-only meaning.
- No icon fonts or icon CDNs: inline SVG only.
- Do not move the Sync button out of the top bar.
