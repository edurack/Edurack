// SERVER-ONLY core of the open Free Resources library: shaping, validation,
// download logging and the admin statistics. Imported by server functions only.
import { createClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/mongo";
import { addDays, istDayKey } from "@/lib/practice-schedule";
import {
  FREE_RESOURCES_BUCKET,
  MAX_RESOURCE_BYTES,
  RESOURCE_ALLOWED_EXTENSIONS,
  RESOURCE_CATEGORIES,
  RESOURCE_EXAMS,
  type AdminResource,
  type PublicResource,
  type ResourceCategory,
  type ResourceExam,
  type ResourceInput,
  type ResourceStats,
} from "@/lib/resource-types";

const SIGNED_URL_SECONDS = 120;
/** The same visitor re-downloading the same file inside this window counts once. */
const DEDUPE_MS = 60 * 60 * 1000;

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : null);

let indexed = false;
async function ensureIndexes() {
  if (indexed) return;
  try {
    const db = await getDb();
    await db.collection("resources").createIndex({ published: 1, deletedAt: 1, exam: 1, category: 1 });
    await db.collection("resourceDownloads").createIndex({ at: -1 });
    await db.collection("resourceDownloads").createIndex({ resourceId: 1, at: -1 });
    await db.collection("resourceDownloads").createIndex({ visitorId: 1, resourceId: 1, at: -1 });
  } catch { /* best-effort */ }
  indexed = true;
}

export function toPublic(d: any): PublicResource {
  return {
    id: String(d._id),
    title: d.title ?? "",
    description: d.description ?? "",
    exam: RESOURCE_EXAMS.includes(d.exam) ? d.exam : "all",
    category: RESOURCE_CATEGORIES.includes(d.category) ? d.category : "other",
    subject: d.subject ?? "",
    fileName: d.fileName ?? "",
    mimeType: d.mimeType ?? "",
    sizeBytes: d.sizeBytes ?? 0,
    downloads: d.downloadCount ?? 0,
    createdAt: iso(d.createdAt) ?? new Date(0).toISOString(),
  };
}

export function toAdmin(d: any, unique = 0): AdminResource {
  return {
    ...toPublic(d),
    published: d.published === true,
    bucket: d.bucket ?? null,
    path: d.path ?? null,
    uniqueDownloaders: unique,
    lastDownloadedAt: iso(d.lastDownloadedAt),
  };
}

/** Validates admin input and returns a clean document. Throws a readable message. */
export function cleanInput(raw: ResourceInput): Omit<ResourceInput, never> {
  const title = clip(raw.title, 120);
  if (!title) throw new Error("Please give the resource a title.");
  if (!RESOURCE_EXAMS.includes(raw.exam)) throw new Error("Pick which exam this is for.");
  if (!RESOURCE_CATEGORIES.includes(raw.category)) throw new Error("Pick a category.");
  const path = clip(raw.path, 400);
  if (!path || path.includes("..")) throw new Error("The file is missing — upload it first.");
  const fileName = clip(raw.fileName, 160);
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!RESOURCE_ALLOWED_EXTENSIONS.includes(ext)) throw new Error(`.${ext || "?"} files aren't allowed.`);
  const sizeBytes = Number(raw.sizeBytes) || 0;
  if (sizeBytes > MAX_RESOURCE_BYTES) throw new Error("That file is too large.");
  return {
    title,
    description: clip(raw.description, 400),
    exam: raw.exam as ResourceExam,
    category: raw.category as ResourceCategory,
    subject: clip(raw.subject, 60),
    fileName,
    mimeType: clip(raw.mimeType, 100) || "application/octet-stream",
    sizeBytes,
    bucket: FREE_RESOURCES_BUCKET, // never trust a bucket name from the browser
    path,
    published: raw.published === true,
  };
}

async function signedUrlFor(doc: { bucket?: string; path?: string; fileName?: string }): Promise<string> {
  if (!doc.bucket || !doc.path) throw new Error("This file isn't available.");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);

  if (serviceKey && baseUrl) {
    const admin = createClient(baseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.storage.from(doc.bucket).createSignedUrl(doc.path, SIGNED_URL_SECONDS, { download: doc.fileName });
    if (!error && data?.signedUrl) return data.signedUrl;
    console.error("[resources] createSignedUrl failed:", error?.message ?? "no url returned", { bucket: doc.bucket, path: doc.path });
    throw new Error("This file couldn't be prepared for download. Please try again in a minute.");
  }

  // No service key on the server. A PRIVATE bucket's public link answers "Bucket not found", so only
  // hand it out if it really works (i.e. the bucket is public) — never send a visitor to a dead link.
  console.error("[resources] SUPABASE_SERVICE_ROLE_KEY is not set on the server — falling back to the public URL.");
  const { supabase } = await import("@/lib/supabase");
  const { data } = supabase.storage.from(doc.bucket).getPublicUrl(doc.path, { download: doc.fileName });
  try {
    const head = await fetch(data.publicUrl, { method: "HEAD" });
    if (head.ok) return data.publicUrl;
  } catch { /* fall through */ }
  throw new Error("Downloads aren't set up yet. (Admin: set SUPABASE_SERVICE_ROLE_KEY on the server and redeploy.)");
}

async function hashIp(): Promise<string | null> {
  try {
    const { getCurrentRequest } = await import("@/lib/get-request");
    const req = getCurrentRequest();
    const fwd = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req?.headers.get("x-real-ip") || "";
    if (!fwd) return null;
    const { createHash } = await import("node:crypto");
    // One-way hash: lets us spot abuse without ever storing a raw IP address.
    return createHash("sha256").update(`${fwd}|${process.env.RESOURCE_IP_SALT ?? "edurack"}`).digest("hex").slice(0, 24);
  } catch {
    return null;
  }
}

/**
 * The only place a file's real location is released. Logs the download FIRST, so a
 * download can't happen without being counted. `uid` is set when the visitor happens
 * to be logged in; otherwise they're a guest, identified only by a random browser id.
 */
export async function recordDownloadAndSign(opts: { resourceId: string; visitorId: string; uid: string | null }): Promise<{ url: string; fileName: string }> {
  const { ObjectId } = await import("mongodb");
  if (!/^[a-f0-9]{24}$/i.test(opts.resourceId)) throw new Error("This file isn't available.");
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection("resources").findOne({ _id: new ObjectId(opts.resourceId), published: true, deletedAt: null });
  if (!doc) throw new Error("This file isn't available.");

  // Sign first: if the file can't be served, nothing is counted.
  const url = await signedUrlFor(doc as any);

  const visitorId = clip(opts.visitorId, 80) || "unknown";
  const now = new Date();
  const downloads = db.collection("resourceDownloads");
  const repeat = await downloads.findOne({ resourceId: opts.resourceId, visitorId, at: { $gte: new Date(now.getTime() - DEDUPE_MS) } }, { projection: { _id: 1 } });

  if (!repeat) {
    await downloads.insertOne({
      resourceId: opts.resourceId,
      title: doc.title,
      exam: doc.exam,
      category: doc.category,
      visitorId,
      uid: opts.uid,
      ipHash: await hashIp(),
      at: now,
    });
    await db.collection("resources").updateOne({ _id: doc._id }, { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: now } });
  }
  return { url, fileName: doc.fileName as string };
}

export async function buildResourceStats(): Promise<ResourceStats> {
  await ensureIndexes();
  const db = await getDb();
  const dl = db.collection("resourceDownloads");
  const now = new Date();
  const today = istDayKey(now);
  const since = (days: number) => new Date(now.getTime() - days * 864e5);
  const dayStartIst = new Date(`${today}T00:00:00+05:30`);

  const [resources, total, todayN, n7, n30, visitors, loggedIn, dailyRows, examRows, catRows, topRows, recent] = await Promise.all([
    db.collection("resources").countDocuments({ deletedAt: null }),
    dl.countDocuments({}),
    dl.countDocuments({ at: { $gte: dayStartIst } }),
    dl.countDocuments({ at: { $gte: since(7) } }),
    dl.countDocuments({ at: { $gte: since(30) } }),
    dl.aggregate([{ $group: { _id: "$visitorId" } }, { $count: "n" }]).toArray(),
    dl.countDocuments({ uid: { $ne: null } }),
    dl.aggregate([{ $match: { at: { $gte: since(31) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Asia/Kolkata" } }, n: { $sum: 1 } } }]).toArray(),
    dl.aggregate([{ $group: { _id: "$exam", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    dl.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    dl.aggregate([{ $group: { _id: "$resourceId", title: { $first: "$title" }, exam: { $first: "$exam" }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]).toArray(),
    dl.find({}).sort({ at: -1 }).limit(15).toArray(),
  ]);

  const dayMap = new Map(dailyRows.map((r) => [String(r._id), r.n as number]));
  return {
    totals: {
      resources, downloads: total, today: todayN, last7d: n7, last30d: n30,
      uniqueVisitors: (visitors[0]?.n as number) ?? 0, loggedIn, guests: total - loggedIn,
    },
    daily: Array.from({ length: 30 }, (_, i) => { const day = addDays(today, i - 29); return { day, n: dayMap.get(day) ?? 0 }; }),
    byExam: examRows.map((r) => ({ label: String(r._id ?? "—"), n: r.n as number })),
    byCategory: catRows.map((r) => ({ label: String(r._id ?? "—"), n: r.n as number })),
    top: topRows.map((r) => ({ id: String(r._id), title: String(r.title ?? ""), exam: r.exam as ResourceExam, n: r.n as number })),
    recent: recent.map((r) => ({ id: String(r.resourceId), title: String(r.title ?? ""), exam: r.exam as ResourceExam, who: r.uid ? "student" : "guest", at: (r.at as Date).toISOString() })),
  };
}

export async function uniqueDownloadersByResource(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.collection("resourceDownloads").aggregate([
    { $group: { _id: { r: "$resourceId", v: "$visitorId" } } },
    { $group: { _id: "$_id.r", n: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.map((r) => [String(r._id), r.n as number]));
}
