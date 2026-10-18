// src/routes/sitemap-mentors[.]xml.ts — GET /sitemap-mentors.xml (mentor profiles + mentorship course pages)
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { SITE_URL } from "@/lib/seo";
import { sitemapUnavailable, toIsoDate, urlEntry, urlsetXml, xmlResponse } from "@/lib/sitemap-core";

export const Route = createFileRoute("/sitemap-mentors.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = await getDb();

          // Only genuinely live, publicly-reachable mentor profiles belong in the sitemap
          const mentors = await db
            .collection("mentors")
            .find({ status: { $ne: "terminated" }, name: { $exists: true, $ne: "" } }, { projection: { updatedAt: 1, createdAt: 1 } })
            .toArray();

          // Mentorship course pages at /course/mentorship/$id
          const batches = await db.collection("mentorshipBatches").find({}, { projection: { updatedAt: 1, createdAt: 1 } }).toArray();

          const entries = [
            ...mentors.map((m) => urlEntry(`${SITE_URL}/mentor-profile/${String(m._id)}`, toIsoDate(m.updatedAt ?? m.createdAt), 0.6, "weekly")),
            ...batches.map((b) => urlEntry(`${SITE_URL}/course/mentorship/${String(b._id)}`, toIsoDate(b.updatedAt ?? b.createdAt), 0.7, "weekly")),
          ];
          return xmlResponse(urlsetXml(entries));
        } catch (err) {
          return sitemapUnavailable("mentors", err);
        }
      },
    },
  },
});
