// Diwali 2026 sale: pure helpers shared by the server and the browser.
//
// The sale is switched ON and OFF from the admin portal (Admin → Edurack Pro → "Diwali sale"). The switch,
// the discount and the end time live in the database (collection `siteSettings`, key "diwali"); see
// server-functions/diwali.ts. Everything festive reads them from there:
//   OFF → the site looks and charges exactly as normal (no lights, ticker, section, popup or discount).
//   ON  → the Diwali UI shows AND every active Pro plan is discounted automatically, whatever it costs.
// It also stops by itself when the end time passes. Normal prices stay in Admin → Edurack Pro; never
// enter sale prices there:
//   • lookupProPlan() in lib/payment-core.ts   → what Razorpay charges (also used by parent pay links)
//   • listActivePlans() in lib/pro-server.ts   → what /pro, the homepage and the drill page show
// Both call diwaliPrice() below, so the price shown equals the price charged.
//
// To remove the theme for good after the festival: delete src/components/diwali/, src/lib/diwali*.ts,
// src/server-functions/diwali.ts, src/components/admin/diwali-sale-card.tsx, and the few Diwali lines in
// routes/__root.tsx, routes/index.tsx, lib/pro-server.ts, lib/payment-core.ts, the plan cards and the
// "DIWALI THEME" block of styles.css. The base design is never modified, only layered over.

/** What the admin can change. `endsAt` is epoch milliseconds so it serialises cleanly. */
export type DiwaliSettings = { enabled: boolean; discountPercent: number; endsAt: number };

export const MIN_DIWALI_DISCOUNT = 1;
export const MAX_DIWALI_DISCOUNT = 90;
/** Diwali (Lakshmi Puja) 2026 is on 8 November; the sale runs a couple of days past it unless the admin says otherwise. */
export const DEFAULT_DIWALI_ENDS_AT = Date.parse("2026-11-10T23:59:59+05:30");
/** Until an admin starts the sale, the site is exactly the normal site. */
export const DEFAULT_DIWALI_SETTINGS: DiwaliSettings = { enabled: false, discountPercent: 50, endsAt: DEFAULT_DIWALI_ENDS_AT };

/** Fixed parts of the campaign (not admin-editable). */
export const DIWALI_SALE = {
  /** Where every "claim" button goes. */
  ctaPath: "/pro" as const,
  /** Popup appears this long after landing on a marketing page, once per browser session. */
  popupDelayMs: 3500,
  popupStorageKey: "edurack-diwali-popup-2026",
  productName: "Edurack Pro",
} as const;

/** Whatever was stored or sent, reduced to valid settings; anything missing or odd falls back to the default (sale off). */
export function cleanDiwaliSettings(raw: unknown): DiwaliSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pct = Number(r.discountPercent);
  const discountPercent = Number.isInteger(pct) && pct >= MIN_DIWALI_DISCOUNT && pct <= MAX_DIWALI_DISCOUNT ? pct : DEFAULT_DIWALI_SETTINGS.discountPercent;
  const rawEnd = r.endsAt instanceof Date ? r.endsAt.getTime() : typeof r.endsAt === "number" ? r.endsAt : typeof r.endsAt === "string" ? Date.parse(r.endsAt) : NaN;
  return { enabled: r.enabled === true, discountPercent, endsAt: Number.isFinite(rawEnd) ? rawEnd : DEFAULT_DIWALI_ENDS_AT };
}

/** Is the sale running right now? Needs the admin switch ON and the end time still ahead. */
export const isDiwaliActive = (s: DiwaliSettings | null | undefined, now: number = Date.now()): boolean => !!s && s.enabled && now < s.endsAt;

/** What a plan listed at `listPrice` (₹) costs right now: discounted while the sale is active, unchanged otherwise. Never below ₹1. */
export function diwaliPrice(listPrice: number, s: DiwaliSettings | null | undefined, now: number = Date.now()): number {
  if (!isDiwaliActive(s, now)) return listPrice;
  return Math.max(1, Math.round((listPrice * (100 - s!.discountPercent)) / 100));
}

/** "10 Nov, 11:59 PM" in India time, stable on server and client. */
export const diwaliEndLabel = (endsAt: number): string =>
  new Date(endsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export type Countdown = { d: number; h: number; m: number; s: number };
export function splitCountdown(ms: number): Countdown {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

const matches = (path: string, prefixes: readonly string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/** Pages where the festive glow must NOT appear: timed exams, drills, lectures and staff/partner portals. */
const NO_AMBIENT = [
  "/test",
  "/test-analysis",
  "/test-result",
  "/simulator",
  "/pyq-drill",
  "/lecture",
  "/mentor-session",
  "/mentor-onboarding",
  "/mentor/dashboard",
  "/admin",
  "/intern",
  "/promoter",
  "/pay",
  "/sold-test",
] as const;
export const ambientAllowed = (path: string) => !matches(path, NO_AMBIENT);

/** Public marketing pages that get the ticker bar and popup (never a student mid-practice). */
const PROMO_PAGES = [
  "/",
  "/pro",
  "/about",
  "/blog",
  "/faq",
  "/contact",
  "/free-resources",
  "/tools",
  "/neet",
  "/jee",
  "/jee-main-2027",
  "/mentorship-sessions",
  "/pyq",
] as const;
export const promoAllowed = (path: string) => matches(path, PROMO_PAGES);
/** The popup skips the sale page itself and the blog (which has its own free-test popup). */
export const popupAllowed = (path: string) => promoAllowed(path) && path !== "/pro" && !matches(path, ["/blog"]);
