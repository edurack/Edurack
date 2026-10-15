// src/routes/sitemap[.]xml.ts
//
// TanStack Start Server Route — serves GET /sitemap.xml.

import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { listSitemapQuestions } from "@/lib/pyq-public-server";
import { allBlueprintPaths, getSubjects } from "@/lib/neet-blueprint";
import { PAPER_BASE, PAPER_SLUGS, paperPath } from "@/lib/neet-paper-analysis";
import { TOPICS_PATH } from "@/lib/neet-topics";
import { loadTreeRows } from "@/lib/pyq-server";

const SITE_URL = "https://www.edurack.in";

// Static, non-dynamic pages. `lastmod` is a manual, best-effort value —
// bump it only when that page's actual content changes, not on every
// deploy (deploy-driven lastmod churn is what makes Google start ignoring
// the field for your whole site).
const staticRoutes: { path: string; lastmod: string; priority: number; changefreq?: string }[] = [
  { path: "/", lastmod: "2026-09-11", priority: 1.0, changefreq: "weekly" },
  { path: "/blog", lastmod: "2026-09-25", priority: 0.7, changefreq: "daily" },
  { path: "/pyq", lastmod: "2026-10-11", priority: 0.9, changefreq: "weekly" },
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function urlEntry(loc: string, lastmod: string, priority: number, changefreq?: string): string {
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
function questionEntry(loc: string, lastmod: string | null): string {
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

// NEET chapter-wise weightage pages (hub, subjects, chapters) — static data, so
// they're always listed. lastmod is the date the dataset was last regenerated.
const BLUEPRINT_LASTMOD = "2026-10-12";
const BLUEPRINT_PRIORITY = { hub: 0.9, subject: 0.8, chapter: 0.7 } as const;
function blueprintEntries(): string[] {
  return allBlueprintPaths().map((p) => urlEntry(`${SITE_URL}${p.path}`, BLUEPRINT_LASTMOD, BLUEPRINT_PRIORITY[p.kind], "monthly"));
}

// Free tools and the data-driven NEET pages. Static content, so these are always listed.
const SEO_LASTMOD = "2026-10-15";
function seoEntries(): string[] {
  return [
    urlEntry(`${SITE_URL}/tools`, SEO_LASTMOD, 0.8, "monthly"),
    urlEntry(`${SITE_URL}/tools/neet-rank-predictor`, SEO_LASTMOD, 0.9, "monthly"),
    urlEntry(`${SITE_URL}/tools/neet-percentile-calculator`, SEO_LASTMOD, 0.9, "monthly"),
    urlEntry(`${SITE_URL}/tools/neet-target-score-planner`, SEO_LASTMOD, 0.8, "monthly"),
    urlEntry(`${SITE_URL}${PAPER_BASE}`, SEO_LASTMOD, 0.8, "monthly"),
    ...PAPER_SLUGS.map((s) => urlEntry(`${SITE_URL}${paperPath(s)}`, SEO_LASTMOD, 0.7, "monthly")),
    urlEntry(`${SITE_URL}${TOPICS_PATH}`, SEO_LASTMOD, 0.8, "monthly"),
    urlEntry(`${SITE_URL}/neet/question-of-the-day`, new Date().toISOString().slice(0, 10), 0.7, "daily"),
  ];
}

// Printable chapter sheets: only for chapters that really have PYQs in the bank (an empty sheet is noindex).
async function sheetEntries(db: Awaited<ReturnType<typeof getDb>>): Promise<string[]> {
  try {
    const rows = await loadTreeRows(db, "neet");
    const have = new Set(rows.filter((r) => r.count > 0).map((r) => `${r.subject}|${r.chapterKey}`));
    return getSubjects().flatMap((s) =>
      s.chapters
        .filter((c) => have.has(`${s.name}|${c.name.trim().toLowerCase()}`))
        .map((c) => urlEntry(`${SITE_URL}/neet/chapter-wise-weightage/${s.key}/${c.slug}/sheet`, SEO_LASTMOD, 0.6, "monthly")),
    );
  } catch (err) {
    console.error("[sitemap] sheet urls failed:", err);
    return [];
  }
}

function buildStaticOnlyXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticRoutes.map((r) => urlEntry(`${SITE_URL}${r.path}`, r.lastmod, r.priority, r.changefreq)),
    ...blueprintEntries(),
    ...seoEntries(),
    "</urlset>",
  ].join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = await getDb();

          // Only genuinely live, publicly-reachable mentor profiles belong in the sitemap
          const mentors = await db
            .collection("mentors")
            .find(
              { status: { $ne: "terminated" }, name: { $exists: true,$ne: "" } },
              { projection: { updatedAt: 1, createdAt: 1 } },
            )
            .toArray();

          // Mentorship course pages at /course/mentorship/$id
          const mentorshipBatches = await db
            .collection("mentorshipBatches")
            .find({}, { projection: { updatedAt: 1, createdAt: 1 } })
            .toArray();

          // Published blog posts — live query pattern
          const blogPosts = await db
            .collection("blogPosts")
            .find(
              { status: "published", deletedAt: null },
              { projection: { slug: 1, updatedAt: 1, publishedAt: 1 } },
            )
            .toArray();

          // Indexable PYQ pages. A failure here must not take the rest of the sitemap down.
          const questionRows = await listSitemapQuestions(db).catch((err) => {
            console.error("[sitemap] question urls failed:", err);
            return [];
          });

          const staticEntries = staticRoutes.map((r) =>
            urlEntry(`${SITE_URL}${r.path}`, r.lastmod, r.priority, r.changefreq),
          );

          const mentorEntries = mentors.map((m) =>
            urlEntry(
              `${SITE_URL}/mentor-profile/${String(m._id)}`,
              toIsoDate(m.updatedAt ?? m.createdAt),
              0.6,
              "weekly",
            ),
          );

          const mentorshipBatchEntries = mentorshipBatches.map((b) =>
            urlEntry(
              `${SITE_URL}/course/mentorship/${String(b._id)}`,
              toIsoDate(b.updatedAt ?? b.createdAt),
              0.7,
              "weekly",
            ),
          );

          const blogEntries = blogPosts.map((p) =>
            urlEntry(
              `${SITE_URL}/blog/${p.slug}`,
              toIsoDate(p.updatedAt ?? p.publishedAt),
              0.6,
              "weekly",
            ),
          );

          const questionEntries = questionRows.map((r) => questionEntry(`${SITE_URL}${r.path}`, r.lastmod));

          const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...staticEntries,
            ...blueprintEntries(),
            ...seoEntries(),
            ...(await sheetEntries(db)),
            ...mentorEntries,
            ...mentorshipBatchEntries,
            ...blogEntries,
            ...questionEntries,
            "</urlset>",
          ].join("\n");

          return new Response(xml, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          });
        } catch (err) {
          console.error("[sitemap] failed to generate:", err);
          return new Response(buildStaticOnlyXml(), {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, s-maxage=60",
            },
          });
        }
      },
    },
  },
});