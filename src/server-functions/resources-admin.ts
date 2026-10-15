// Admin → Free Resources: upload/manage the files and see who is downloading them.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { logAdminAction, requireTeamAdmin } from "@/lib/team-core";
import { buildResourceStats, cleanInput, toAdmin, uniqueDownloadersByResource } from "@/lib/resource-core";
import type { AdminResource, ResourceInput, ResourceStats } from "@/lib/resource-types";

const MODULE = "Free Resources";

export const adminListResources = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ items: AdminResource[]; stats: ResourceStats }> => {
    await requireTeamAdmin(data.token);
    const db = await getDb();
    const [docs, unique, stats] = await Promise.all([
      db.collection("resources").find({ deletedAt: null }).sort({ createdAt: -1 }).limit(500).toArray(),
      uniqueDownloadersByResource(),
      buildResourceStats(),
    ]);
    return { items: docs.map((d) => toAdmin(d, unique.get(String(d._id)) ?? 0)), stats };
  });

export const adminCreateResource = createServerFn({ method: "POST" })
  .validator((data: { token: string; input: ResourceInput }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    await logAdminAction(data.token, "createResource", { title: data.input?.title, exam: data.input?.exam }, MODULE);
    const clean = cleanInput(data.input);
    const db = await getDb();
    const now = new Date();
    const r = await db.collection("resources").insertOne({ ...clean, downloadCount: 0, lastDownloadedAt: null, createdAt: now, updatedAt: now, deletedAt: null });
    return { id: String(r.insertedId) };
  });

export const adminUpdateResource = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; input: ResourceInput }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    await logAdminAction(data.token, "updateResource", { title: data.input?.title, exam: data.input?.exam }, MODULE);
    const { ObjectId } = await import("mongodb");
    if (!/^[a-f0-9]{24}$/i.test(data.id)) throw new Error("Resource not found.");
    const clean = cleanInput(data.input);
    const db = await getDb();
    const r = await db.collection("resources").updateOne({ _id: new ObjectId(data.id), deletedAt: null }, { $set: { ...clean, updatedAt: new Date() } });
    if (!r.matchedCount) throw new Error("Resource not found.");
    return { ok: true };
  });

export const adminSetResourcePublished = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; published: boolean }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    await logAdminAction(data.token, "setResourcePublished", { id: data.id, published: !!data.published }, MODULE);
    const { ObjectId } = await import("mongodb");
    if (!/^[a-f0-9]{24}$/i.test(data.id)) throw new Error("Resource not found.");
    const db = await getDb();
    await db.collection("resources").updateOne({ _id: new ObjectId(data.id), deletedAt: null }, { $set: { published: !!data.published, updatedAt: new Date() } });
    return { ok: true };
  });

/** Soft delete: the file disappears from the public page but its download history stays in the stats. */
export const adminDeleteResource = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireTeamAdmin(data.token);
    await logAdminAction(data.token, "deleteResource", { id: data.id }, MODULE);
    const { ObjectId } = await import("mongodb");
    if (!/^[a-f0-9]{24}$/i.test(data.id)) throw new Error("Resource not found.");
    const db = await getDb();
    await db.collection("resources").updateOne({ _id: new ObjectId(data.id) }, { $set: { deletedAt: new Date(), published: false } });
    return { ok: true };
  });
