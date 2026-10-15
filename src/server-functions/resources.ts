// Open "Free Resources" library — PUBLIC server functions. No login needed.
//
//  • listPublicResources: published files only, metadata only (never a link or storage path).
//  • downloadResource:   logs the download, then returns a link that expires in 2 minutes.
//    If the visitor happens to be logged in we attach their uid so the admin can tell
//    students from guests; a missing/invalid token just means "guest" — it never blocks.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { adminAuth } from "@/lib/firebase-admin";
import { recordDownloadAndSign, toPublic } from "@/lib/resource-core";
import { RESOURCE_CATEGORIES, RESOURCE_EXAMS, type PublicResource, type ResourceCategory, type ResourceExam } from "@/lib/resource-types";

export type ResourceList = { items: PublicResource[]; total: number };

export const listPublicResources = createServerFn({ method: "GET" })
  .validator((data: { exam?: string; category?: string; q?: string }) => data)
  .handler(async ({ data }): Promise<ResourceList> => {
    const db = await getDb();
    const filter: Record<string, unknown> = { published: true, deletedAt: null };
    if (data.exam && RESOURCE_EXAMS.includes(data.exam as ResourceExam)) {
      // "NEET" shows NEET files AND the ones marked for every exam.
      filter.exam = data.exam === "all" ? "all" : { $in: [data.exam, "all"] };
    }
    if (data.category && RESOURCE_CATEGORIES.includes(data.category as ResourceCategory)) filter.category = data.category;
    const q = String(data.q ?? "").trim().slice(0, 60);
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { description: rx }, { subject: rx }];
    }
    const docs = await db.collection("resources").find(filter).sort({ createdAt: -1 }).limit(200).toArray();
    return { items: docs.map(toPublic), total: docs.length };
  });

export const downloadResource = createServerFn({ method: "POST" })
  .validator((data: { resourceId: string; visitorId: string; token?: string | null }) => data)
  .handler(async ({ data }) => {
    let uid: string | null = null;
    if (data.token) {
      try { uid = (await adminAuth.verifyIdToken(data.token)).uid; } catch { uid = null; }
    }
    return recordDownloadAndSign({ resourceId: data.resourceId, visitorId: data.visitorId, uid });
  });
