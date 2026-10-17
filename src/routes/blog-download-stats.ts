// Admin-only: who downloaded a blog post's documents, and how often.
// Reads the `blogDocumentDownloads` log written by blog-documents.ts.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";

export type DocDownloadStat = { documentId: string; title: string; total: number; unique: number; last: string | null };
export type DownloadRow = { documentId: string; title: string; uid: string; name: string; email: string | null; at: string };

export const getBlogDownloadStats = createServerFn({ method: "POST" })
  .validator((data: { token: string; postId: string }) => data)
  .handler(async ({ data }): Promise<{ docs: DocDownloadStat[]; recent: DownloadRow[] }> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
    const db = await getDb();
    const col = db.collection("blogDocumentDownloads");
    const match = { postId: String(data.postId) };

    const [perDoc, recent] = await Promise.all([
      col
        .aggregate([
          { $match: match },
          { $group: { _id: "$documentId", title: { $last: "$title" }, total: { $sum: 1 }, uids: { $addToSet: "$uid" }, last: { $max: "$at" } } },
        ])
        .toArray(),
      col.find(match).sort({ at: -1 }).limit(100).toArray(),
    ]);

    const uids = [...new Set(recent.map((r) => r.uid as string))];
    const profiles = uids.length
      ? await db.collection("profiles").find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1, email: 1 } }).toArray()
      : [];
    const byUid = new Map(profiles.map((p) => [p.uid as string, p]));

    return {
      docs: perDoc.map((d) => ({
        documentId: String(d._id),
        title: String(d.title ?? ""),
        total: d.total as number,
        unique: (d.uids as string[]).length,
        last: d.last instanceof Date ? d.last.toISOString() : null,
      })),
      recent: recent.map((r) => {
        const p = byUid.get(r.uid as string);
        return {
          documentId: String(r.documentId),
          title: String(r.title ?? ""),
          uid: r.uid as string,
          name: (p?.fullName as string) || "Student",
          email: (p?.email as string | null) ?? null,
          at: (r.at as Date).toISOString(),
        };
      }),
    };
  });
