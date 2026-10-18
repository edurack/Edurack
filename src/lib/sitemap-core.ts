// SERVER-ONLY. Shared pieces for /sitemap.xml (the index) and the child
// sitemaps (/sitemap-pages.xml, -neet, -blog, -mentors, -questions).
//
// Each child is generated on its own, so one failing query returns a 503 for
// that file only (Google retries it) instead of caching a half-empty sitemap.
import { SITE_URL } from "@/lib/seo";
import { getDb } from "@/lib/mongo";
import { allBlueprintPaths, getSubjects } from "@/lib/neet-blueprint";
import { PAPER_BASE, PAPER_SLUGS, paperPath } from "@/lib/neet-paper-analysis";
import { TOPICS_PATH } from "@/lib/neet-topics";
import { loadTreeRows } from "@/lib/pyq-server";
import { istDayKey } from "@/lib/practice-schedule";

type Db = Awaited<ReturnType<typeof getDb>>;

export const SITEMAP_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

// Static, non-dynamic pages. `lastmod` is a manual, best-effort value —
// bump it only when that page's actual content changes, not on every
// deploy (deploy-driven lastmod churn is what makes Google start ignoring
// the field for your whole site).
export const staticRoutes: { path: string; lastmod: string; priority: number; changefreq?: string }[] = [
  { path: "/", lastmod: "2026-09-11", priority: 1.0, changefreq: "weekly" },
  { path: "/blog", lastmod: "2026-09-25", priority: 0.7, changefreq: "daily" },
  { path: "/pyq", lastmod: "2026-10-11", priority: 0.9, changefreq: "weekly" },
  { path: "/free-resources", lastmod: "2026-10-15", priority: 0.8, changefreq: "weekly" },
  { path: "/simulator/live", lastmod: "2026-09-11", priority: 0.9, changefreq: "monthly" },
  { path: "/join-mentor", lastmod: "2026-09-11", priority: 0.7, changefreq: "monthly" },
  { path: "/join-intern", lastmod: "2026-09-28", priority: 0.5, changefreq: "monthly" },
  { path: "/about", lastmod: "2026-09-28", priority: 0.6 },
  { path: "/faq", lastmod: "2026-09-28", priority: 0.6 },
  { path: "/verify", lastmod: "2026-09-28", priority: 0.3 },
  { path: "/contact", lastmod: "2026-09-11", priority: 0.5 },
  { path: "/login", lastmod: "2026-09-11", priority: 0.2 },
  { path: "/legal/terms", lastmod: "2026-09-11", priority: 0.3 },
  { path: "/legal/privacy", lastmod: "2026-09-11", priority: 0.3 },
  { path: "/legal/refund", lastmod: "2026-09-11", priority: 0.3 },
];

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function urlEntry(loc: string, lastmod: string, priority: number, changefreq?: string): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : "",
    `    <priority>${priority.toFixed(1)}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

// Public question pages (/question/...) have no reliable edit date on the
// question document, so lastmod is left out when we don't know it rather than
// being faked with today's date (which would change on every request).
export function questionEntry(loc: string, lastmod: string | null): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    "    <priority>0.5</priority>",
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

export function urlsetXml(entries: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");
}

export function sitemapIndexXml(locs: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locs.map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`),
    "</sitemapindex>",
  ].join("\n");
}

export function xmlResponse(xml: string, cacheControl: string = SITEMAP_CACHE): Response {
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": cacheControl },
  });
}

/** A failed child sitemap: Google retries a 503, and nothing partial gets cached. */
export function sitemapUnavailable(name: string, err: unknown): Response {
  console.error(`[sitemap] ${name} failed:`, err);
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Retry-After": "300", "Cache-Control": "no-store" },
  });
}

export function staticEntries(): string[] {
  return staticRoutes.map((r) => urlEntry(`${SITE_URL}${r.path}`, r.lastmod, r.priority, r.changefreq));
}

// NEET chapter-wise weightage pages (hub, subjects, chapters) — static data, so
// they're always listed. lastmod is the date the dataset was last regenerated.
const BLUEPRINT_LASTMOD = "2026-10-12";
const BLUEPRINT_PRIORITY = { hub: 0.9, subject: 0.8, chapter: 0.7 } as const;
export function blueprintEntries(): string[] {
  return allBlueprintPaths().map((p) => urlEntry(`${SITE_URL}${p.path}`, BLUEPRINT_LASTMOD, BLUEPRINT_PRIORITY[p.kind], "monthly"));
}

// Free tools and the data-driven NEET pages. Static content, so these are always listed.
const SEO_LASTMOD = "2026-10-15";
export function seoEntries(): string[] {
  return [
    urlEntry(`${SITE_URL}/tools`, SEO_LASTMOD, 0.8, "monthly"),
    urlEntry(`${SITE_URL}/tools/neet-rank-predictor`, SEO_LASTMOD, 0.9, "monthly"),
    urlEntry(`${SITE_URL}/tools/neet-percentile-calculator`, SEO_LASTMOD, 0.9, "monthly"),
    urlEntry(`${SITE_URL}/tools/neet-target-score-planner`, SEO_LASTMOD, 0.8, "monthly"),
    urlEntry(`${SITE_URL}${PAPER_BASE}`, SEO_LASTMOD, 0.8, "monthly"),
    ...PAPER_SLUGS.map((s) => urlEntry(`${SITE_URL}${paperPath(s)}`, SEO_LASTMOD, 0.7, "monthly")),
    urlEntry(`${SITE_URL}${TOPICS_PATH}`, SEO_LASTMOD, 0.8, "monthly"),
    // The question of the day switches at midnight IST (see getQuestionOfTheDay), so lastmod is the IST day —
    // not the UTC date, which would lag by up to 5½ hours after the page has already changed.
    urlEntry(`${SITE_URL}/neet/question-of-the-day`, istDayKey(new Date()), 0.7, "daily"),
  ];
}

// Printable chapter sheets: only for chapters that really have PYQs in the bank (an empty sheet is noindex).
// Throws on a DB failure so the caller can answer 503 instead of caching a short list.
export async function sheetEntries(db: Db): Promise<string[]> {
  const rows = await loadTreeRows(db, "neet");
  const have = new Set(rows.filter((r) => r.count > 0).map((r) => `${r.subject}|${r.chapterKey}`));
  return getSubjects().flatMap((s) =>
    s.chapters
      .filter((c) => have.has(`${s.name}|${c.name.trim().toLowerCase()}`))
      .map((c) => urlEntry(`${SITE_URL}/neet/chapter-wise-weightage/${s.key}/${c.slug}/sheet`, SEO_LASTMOD, 0.6, "monthly")),
  );
}
