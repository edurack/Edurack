// Festival sales (Diwali, Christmas): pure helpers shared by the server and the browser.
//
// A sale is switched ON and OFF from the admin portal (Admin → Edurack Pro → "Festival sale"). The theme, the switch,
// the discount and the end time live in the database (collection `siteSettings`, key "festival"); see
// server-functions/festival.ts. Only ONE festival can run at a time. Everything festive reads the settings from there:
//   OFF → the site looks and charges exactly as normal (no lights, ticker, section, popup or discount).
//   ON  → the chosen festival's UI shows AND every active Pro plan is discounted automatically, whatever it costs.
// It also stops by itself when the end time passes. Normal prices stay in Admin → Edurack Pro; never
// enter sale prices there:
//   • lookupProPlan() in lib/payment-core.ts   → what Razorpay charges (also used by parent pay links)
//   • listActivePlans() in lib/pro-server.ts   → what /pro, the homepage and the drill page show
// Both call festivalPrice() below, so the price shown equals the price charged.
//
// To add another festival (Holi, Eid, New Year…): add an entry to THEMES, a decor/copy block in
// src/components/festival/, and a `[data-festival="<id>"]` block in styles.css. To remove one for good, delete its pieces;
// the base design is never modified, only layered over.

export type FestivalTheme = "diwali" | "christmas";
export const FESTIVAL_THEMES: readonly FestivalTheme[] = ["diwali", "christmas"];

/** What the admin can change. `endsAt` is epoch milliseconds so it serialises cleanly. */
export type FestivalSettings = { enabled: boolean; theme: FestivalTheme; discountPercent: number; endsAt: number };

export const MIN_FESTIVAL_DISCOUNT = 1;
export const MAX_FESTIVAL_DISCOUNT = 90;

/** Per-festival facts. `prefix` is the CSS class prefix in styles.css (dw- / xm-). */
export const THEMES: Record<
  FestivalTheme,
  {
    label: string; // "Diwali"
    prefix: "dw" | "xm";
    /** Suggested discount when the admin picks this festival. */
    defaultPercent: number;
    /** Suggested end: Diwali (Lakshmi Puja) is 8 Nov 2026, the sale runs two days past it; Christmas is 25 Dec, the sale runs till 27 Dec. */
    defaultEndsAt: number;
    popupStorageKey: string;
    /** Small pill above the headline. */
    kicker: string;
    /** Big word in the section/popup headline, and what the top ticker says. */
    headWord: string;
    greeting: string;
    /** Words for the tape and the sentence under the headline. */
    tape: string;
    pitch: string;
    /** Outlined background word. */
    bigWord: string;
  }
> = {
  diwali: {
    label: "Diwali",
    prefix: "dw",
    defaultPercent: 50,
    defaultEndsAt: Date.parse("2026-11-10T23:59:59+05:30"),
    popupStorageKey: "edurack-diwali-popup-2026",
    kicker: "Festival of Lights",
    headWord: "Diwali",
    greeting: "Happy Diwali",
    tape: "Diwali sale",
    pitch: "Light up your prep.",
    bigWord: "Diwali",
  },
  christmas: {
    label: "Christmas",
    prefix: "xm",
    defaultPercent: 25,
    defaultEndsAt: Date.parse("2026-12-27T23:59:59+05:30"),
    popupStorageKey: "edurack-christmas-popup-2026",
    kicker: "Season of giving",
    headWord: "Christmas",
    greeting: "Merry Christmas",
    tape: "Christmas sale",
    pitch: "Gift yourself a head start.",
    bigWord: "Noël",
  },
};

/** Until an admin starts a sale, the site is exactly the normal site. */
export const DEFAULT_FESTIVAL_SETTINGS: FestivalSettings = { enabled: false, theme: "diwali", discountPercent: THEMES.diwali.defaultPercent, endsAt: THEMES.diwali.defaultEndsAt };

/** Fixed parts of every campaign (not admin-editable). */
export const FESTIVAL_SALE = {
  /** Where every "claim" button goes. */
  ctaPath: "/pro" as const,
  /** Popup appears this long after landing on a marketing page, once per browser session. */
  popupDelayMs: 3500,
  productName: "Edurack Pro",
} as const;

/** Whatever was stored or sent, reduced to valid settings; anything missing or odd falls back to the theme's default (sale off). */
export function cleanFestivalSettings(raw: unknown): FestivalSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const theme: FestivalTheme = FESTIVAL_THEMES.includes(r.theme as FestivalTheme) ? (r.theme as FestivalTheme) : "diwali"; // sales saved before themes existed were Diwali
  const pct = Number(r.discountPercent);
  const discountPercent = Number.isInteger(pct) && pct >= MIN_FESTIVAL_DISCOUNT && pct <= MAX_FESTIVAL_DISCOUNT ? pct : THEMES[theme].defaultPercent;
  const rawEnd = r.endsAt instanceof Date ? r.endsAt.getTime() : typeof r.endsAt === "number" ? r.endsAt : typeof r.endsAt === "string" ? Date.parse(r.endsAt) : NaN;
  return { enabled: r.enabled === true, theme, discountPercent, endsAt: Number.isFinite(rawEnd) ? rawEnd : THEMES[theme].defaultEndsAt };
}

/** Is the sale running right now? Needs the admin switch ON and the end time still ahead. */
export const isFestivalActive = (s: FestivalSettings | null | undefined, now: number = Date.now()): boolean => !!s && s.enabled && now < s.endsAt;

/** What a plan listed at `listPrice` (₹) costs right now: discounted while the sale is active, unchanged otherwise. Never below ₹1. */
export function festivalPrice(listPrice: number, s: FestivalSettings | null | undefined, now: number = Date.now()): number {
  if (!isFestivalActive(s, now)) return listPrice;
  return Math.max(1, Math.round((listPrice * (100 - s!.discountPercent)) / 100));
}

/** "10 Nov, 11:59 PM" in India time, stable on server and client. */
export const festivalEndLabel = (endsAt: number): string =>
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
