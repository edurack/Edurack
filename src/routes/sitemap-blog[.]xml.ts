// src/routes/sitemap-blog[.]xml.ts — GET /sitemap-blog.xml (published blog posts)
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { SITE_URL } from "@/lib/seo";
import { sitemapUnavailable, toIsoDate, urlEntry, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-blog.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = await getDb();
          const posts = await db
            .collection("blogPosts")
            .find({ status: "published", deletedAt: null }, { projection: { slug: 1, updatedAt: 1, publishedAt: 1 } })
            .toArray();
          const entries = posts.map((p) => urlEntry(`${SITE_URL}/blog/${p.slug}`, toIsoDate(p.updatedAt ?? p.publishedAt), 0.6, "weekly"));
          return xmlResponse(urlsetXml(entries));
        } catch (err) {
          return sitemapUnavailable("blog", err);
        }
      },
    },
  },
});
