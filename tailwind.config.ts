import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "rgb(var(--c-page) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        sunken: "rgb(var(--c-sunken) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        "line-strong": "rgb(var(--c-line-strong) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        ink2: "rgb(var(--c-ink-2) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        good: "rgb(var(--c-good) / <alpha-value>)",
        bad: "rgb(var(--c-bad) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
      },
      fontFamily: {
        // Same pairing as the X Developer Console: Inter + Geist Mono (loaded with next/font in layout.tsx).
        sans: ["var(--font-inter)", "Inter", "Segoe UI", "Arial", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      borderRadius: { panel: "14px", control: "6px" },
      transitionTimingFunction: { console: "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
  },
  plugins: [],
};
export default config;
