import type { CSSProperties } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Admin "Instrument Panel" theme
//
// The rest of the app themes itself through CSS custom properties
// (--background, --card, --primary, ...) consumed by utility classes like
// `clay`, `clay-btn`, `bg-card`, `text-foreground`. The admin portal is a
// completely different audience and job — a small ops team monitoring and
// controlling a live platform, not a student browsing a warm consumer
// product — so instead of reusing the site's light "clay" palette, this
// overrides those same variables with a dark graphite base and a warm
// amber signal color, scoped to whatever is wrapped in ADMIN_THEME_VARS.
//
// Because every admin module already reads these variables, this one
// override re-skins the entire admin app — sidebar, forms, buttons, cards,
// focus rings — without touching each module's internals.
// ─────────────────────────────────────────────────────────────────────────
export const ADMIN_THEME_VARS = {
  "--background": "oklch(0.145 0.007 75)",
  "--foreground": "oklch(0.95 0.004 75)",

  "--card": "oklch(0.19 0.009 75)",
  "--card-foreground": "oklch(0.95 0.004 75)",
  "--popover": "oklch(0.2 0.009 75)",
  "--popover-foreground": "oklch(0.95 0.004 75)",

  // Signal amber — the admin portal's one accent color, standing in for
  // the site's sapphire primary everywhere a button, focus ring, or
  // active nav state reads var(--primary).
  "--primary": "oklch(0.78 0.15 75)",
  "--primary-foreground": "oklch(0.16 0.02 75)",

  "--secondary": "oklch(0.235 0.011 75)",
  "--secondary-foreground": "oklch(0.92 0.006 75)",
  "--muted": "oklch(0.21 0.009 75)",
  "--muted-foreground": "oklch(0.64 0.014 75)",
  "--accent": "oklch(0.26 0.03 75)",
  "--accent-foreground": "oklch(0.92 0.02 75)",

  "--destructive": "oklch(0.62 0.19 25)",
  "--destructive-foreground": "#ffffff",

  "--border": "oklch(1 0 0 / 9%)",
  "--input": "oklch(1 0 0 / 11%)",
  "--ring": "oklch(0.78 0.15 75)",

  // Secondary signal (cool teal) for metrics/status that shouldn't compete
  // with the amber primary — kept for MetricCard and status chips.
  "--sky-soft": "oklch(0.26 0.045 195)",
  "--sky-deep": "oklch(0.78 0.15 75)",
  "--teal-soft": "oklch(0.28 0.05 180)",
  "--mint-soft": "oklch(0.28 0.045 155)",
  "--coral-soft": "oklch(0.32 0.09 25)",
  "--lemon-soft": "oklch(0.32 0.07 95)",
  "--lilac-soft": "oklch(0.27 0.04 300)",
} as CSSProperties;

// Applied alongside `dark` so Tailwind's `dark:` variant and every
// existing `.dark { ... }` rule resolve consistently underneath the
// overrides above.
export const ADMIN_THEME_CLASS = "dark";
