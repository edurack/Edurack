// src/routes/sitemap[.]xml.ts
//
// TanStack Start Server Route — serves GET /sitemap.xml.

import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";

const SITE_URL = "https://www.edurack.in";

// Static, non-dynamic pages. `lastmod` is a manual, best-effort value —
// bump it only when that page's actual content changes, not on every
// deploy (deploy-driven lastmod churn is what makes Google start ignoring
// the field for your whole site).
const staticRoutes: { path: string; lastmod: string; priority: number; changefreq?: string }[] = [
  { path: "/", lastmod: "2026-09-11", priority: 1.0, changefreq: "weekly" },
  { path: "/blog", lastmod: "2026-09-25", priority: 0.7, changefreq: "daily" },
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

          const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...staticEntries,
            ...mentorEntries,
            ...mentorshipBatchEntries,
            ...blogEntries,
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