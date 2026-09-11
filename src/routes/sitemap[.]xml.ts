// src/routes/sitemap[.]xml.ts
//
// TanStack Start Server Route — serves GET /sitemap.xml.
//
// File-naming note: the brackets around the dot (`sitemap[.]xml.ts`) are
// TanStack Router's escape syntax so the router treats `.xml` as a literal
// part of the URL path instead of a route-segment separator. This produces
// a route at exactly `/sitemap.xml` — see the "Server Routes" guide's file
// naming table (`my-script[.]js.ts` → `/my-script.js`).
//
// WHY a server route instead of a static file in /public:
//   Your mentor-profile pages (/mentor-profile/$mentorId) are created the
//   moment an admin assigns a mentor to a batch — no deploy happens in
//   between. A static sitemap.xml would go stale the first time that
//   happens. This queries Mongo on each request via the same `getDb()`
//   helper your other server functions already use, so the sitemap is
//   always exactly as current as your database — and because it's a
//   TanStack Start server route, it goes through the same Nitro/Vercel
//   build as the rest of your app, no separate deploy config needed.
//
// CACHING: the Cache-Control header below tells Vercel's edge network to
// cache the response for 1 hour and serve stale content instantly for up
// to a day while regenerating in the background, so crawlers get a fast
// response and Mongo isn't hit on every single crawl.

import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";

const SITE_URL = "https://www.edurack.in";

// Static, non-dynamic pages. `lastmod` is a manual, best-effort value —
// bump it only when that page's actual content changes, not on every
// deploy (deploy-driven lastmod churn is what makes Google start ignoring
// the field for your whole site).
const staticRoutes: { path: string; lastmod: string; priority: number; changefreq?: string }[] = [
  { path: "/", lastmod: "2026-09-11", priority: 1.0, changefreq: "weekly" },
  { path: "/simulator/live", lastmod: "2026-09-11", priority: 0.9, changefreq: "monthly" },
  { path: "/join-mentor", lastmod: "2026-09-11", priority: 0.7, changefreq: "monthly" },
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

function buildStaticOnlyXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticRoutes.map((r) => urlEntry(`${SITE_URL}${r.path}`, r.lastmod, r.priority, r.changefreq)),
    "</urlset>",
  ].join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = await getDb();

          // Only genuinely live, publicly-reachable mentor profiles belong
          // in the sitemap — same eligibility rule used in
          // listMentorsForLanding (status not "terminated", must have a
          // name). Submitting a URL crawlers land on and immediately see
          // as incomplete/removed hurts crawl trust site-wide.
          const mentors = await db
            .collection("mentors")
            .find(
              { status: { $ne: "terminated" }, name: { $exists: true, $ne: "" } },
              { projection: { updatedAt: 1, createdAt: 1 } },
            )
            .toArray();

          // Mentorship course pages at /course/mentorship/$id, backed by
          // getPublicMentorshipBatch — now genuinely public (no auth
          // required), so they're real, crawlable, content-bearing pages
          // and belong in the sitemap the same way mentor profiles do.
          const mentorshipBatches = await db
            .collection("mentorshipBatches")
            .find({}, { projection: { updatedAt: 1, createdAt: 1 } })
            .toArray();

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

          const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...staticEntries,
            ...mentorEntries,
            ...mentorshipBatchEntries,
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
          // Fail safe: still return a valid (if minimal) sitemap rather
          // than a 500, so a transient DB hiccup never takes the sitemap
          // offline for a crawler that happens to hit it at the wrong
          // moment.
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