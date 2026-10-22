// src/routes/sitemap-mentors[.]xml.ts — GET /sitemap-mentors.xml (mentor profiles + mentorship course pages + mentor session pages)
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/mongo";
import { SITE_URL } from "@/lib/seo";
import { supabase } from "@/lib/supabase";
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

          // Bookable mentor sessions at /mentor-session/$id. Paused or deleted ones are left
          // out (their page answers 404). If this lookup fails, the rest of the sitemap
          // is still served — a session missing from the sitemap for an hour does no harm.
          let sessionEntries: string[] = [];
          try {
            const { data: sessionRows, error } = await supabase.from("mentor_session_offerings").select("id, created_at, updated_at").eq("active", true);
            if (error) throw new Error(error.message);
            sessionEntries = (sessionRows ?? []).map((r) => urlEntry(`${SITE_URL}/mentor-session/${r.id}`, toIsoDate(r.updated_at ?? r.created_at), 0.7, "weekly"));
          } catch (err) {
            console.error("[sitemap] mentor sessions skipped:", err);
          }

          const entries = [
            ...mentors.map((m) => urlEntry(`${SITE_URL}/mentor-profile/${String(m._id)}`, toIsoDate(m.updatedAt ?? m.createdAt), 0.6, "weekly")),
            ...batches.map((b) => urlEntry(`${SITE_URL}/course/mentorship/${String(b._id)}`, toIsoDate(b.updatedAt ?? b.createdAt), 0.7, "weekly")),
            ...sessionEntries,
          ];
          return xmlResponse(urlsetXml(entries));
        } catch (err) {
          return sitemapUnavailable("mentors", err);
        }
      },
    },
  },
});
