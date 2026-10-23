// src/lib/jee-resource-core.ts
//
// SERVER-ONLY core of the JEE Main 2027 Notes & Practice Sheets library: input validation, secure storage
// access, preview/download logging and the queries behind the admin table and the public pages.
// Imported by server functions only (never by components).
//
// Nothing here reads, rewrites or generates PDF contents. The only thing ever looked at is the first five
// bytes of an uploaded object, to confirm it really is a PDF.
import { createClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/mongo";
import { getJeeChapter } from "@/lib/jee-blueprint";
import { createTtlCache } from "@/lib/simple-cache";
import {
  ADMIN_PAGE_SIZE,
  DEFAULT_JEE_EXAM,
  JEE_LIBRARY_YEAR,
  JEE_RESOURCES_BUCKET,
  JEE_RESOURCE_TYPES,
  MAX_JEE_RESOURCE_BYTES,
  hasPdfMagic,
  isIsoDate,
  isJeeExam,
  isJeeSubject,
  isJeeType,
  safeFileStem,
  validatePdfMeta,
  type AdminJeeResource,
  type JeeAdminFilters,
  type JeeAdminList,
  type JeeLibrarySummary,
  type JeeResourceInput,
  type JeeResourceSubject,
  type JeeResourceType,
  type PublicJeeResource,
} from "@/lib/jee-resource-types";

const COLLECTION = "jeeResources";
const EVENTS = "jeeResourceEvents";
const UPLOAD_PATH_RE = /^uploads\/[a-z0-9]+-[a-z0-9]+\/[A-Za-z0-9_-]+\.pdf$/;
const DOWNLOAD_URL_SECONDS = 120;
const PREVIEW_URL_SECONDS = 900; // long enough to read, and to use "open in new tab" from the viewer
/** The same visitor re-opening the same file inside this window counts once. */
const DEDUPE_MS = 60 * 60 * 1000;

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : null);
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let indexed = false;
async function ensureIndexes() {
  if (indexed) return;
  try {
    const db = await getDb();
    const c = db.collection(COLLECTION);
    await c.createIndex({ path: 1 }, { unique: true }); // one record per uploaded object → double-submit can't duplicate
    await c.createIndex({ deletedAt: 1, published: 1, examYear: 1, subjectKey: 1, chapterSlug: 1, type: 1, displayOrder: 1 });
    await c.createIndex({ createdAt: -1 });
    await db.collection(EVENTS).createIndex({ resourceId: 1, type: 1, visitorId: 1, at: -1 });
    await db.collection(EVENTS).createIndex({ at: -1 });
  } catch {
    /* best-effort */
  }
  indexed = true;
}

// ── Shaping ─────────────────────────────────────────────────────────────────
export function toPublic(d: any): PublicJeeResource {
  return {
    id: String(d._id),
    title: d.title ?? "",
    description: d.description ?? "",
    exam: isJeeExam(d.exam) ? d.exam : DEFAULT_JEE_EXAM,
    examYear: Number(d.examYear) || JEE_LIBRARY_YEAR,
    subjectKey: d.subjectKey,
    chapterSlug: d.chapterSlug ?? "",
    type: isJeeType(d.type) ? d.type : "other",
    fileName: d.fileName ?? "",
    sizeBytes: d.sizeBytes ?? 0,
    version: d.version ?? "",
    lastReviewedAt: d.lastReviewedAt ?? null,
    publishedAt: iso(d.publishedAt),
    updatedAt: iso(d.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function toAdmin(d: any): AdminJeeResource {
  return {
    ...toPublic(d),
    published: d.published === true,
    displayOrder: Number(d.displayOrder) || 0,
    sourceConfirmed: d.sourceConfirmed === true,
    mimeType: d.mimeType ?? "application/pdf",
    downloadCount: d.downloadCount ?? 0,
    previewCount: d.previewCount ?? 0,
    createdAt: iso(d.createdAt) ?? new Date(0).toISOString(),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────
export type CleanMeta = {
  exam: string;
  examYear: number;
  subjectKey: JeeResourceSubject;
  chapterSlug: string;
  type: JeeResourceType;
  title: string;
  description: string;
  published: boolean;
  version: string;
  lastReviewedAt: string | null;
  displayOrder: number;
  sourceConfirmed: boolean;
};

/** Validates the admin form and returns a clean document. Throws a message the admin can act on. */
export function cleanMeta(raw: JeeResourceInput): CleanMeta {
  if (!isJeeExam(raw.exam)) throw new Error("Pick which exam this resource is for.");
  if (!isJeeSubject(raw.subjectKey)) throw new Error("Pick a subject.");
  // Chapters are the existing static JEE chapter list — validating against it is what prevents duplicates/typos.
  const chapter = getJeeChapter(raw.subjectKey, String(raw.chapterSlug));
  if (!chapter) throw new Error("Pick a chapter from the list for that subject.");
  if (!isJeeType(raw.type)) throw new Error("Pick a resource type.");
  const title = clip(raw.title, 140);
  if (!title) throw new Error("Please give the resource a title.");
  const examYear = Math.trunc(Number(raw.examYear));
  if (!Number.isFinite(examYear) || examYear < 2024 || examYear > 2100) throw new Error("Enter a valid exam year, e.g. 2027.");
  const lastReviewedAt = clip(raw.lastReviewedAt, 10);
  if (lastReviewedAt && !isIsoDate(lastReviewedAt)) throw new Error("Last reviewed date must be a valid date.");
  const displayOrder = Math.trunc(Number(raw.displayOrder) || 0);
  if (displayOrder < 0 || displayOrder > 9999) throw new Error("Display order must be between 0 and 9999.");
  const published = raw.published === true;
  const sourceConfirmed = raw.sourceConfirmed === true;
  if (published && !sourceConfirmed) throw new Error("Confirm the source/licensing box before publishing, or save as a draft.");
  return {
    exam: raw.exam,
    examYear,
    subjectKey: raw.subjectKey,
    chapterSlug: chapter.slug,
    type: raw.type,
    title,
    description: clip(raw.description, 500),
    published,
    version: clip(raw.version, 20),
    lastReviewedAt: lastReviewedAt || null,
    displayOrder,
    sourceConfirmed,
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────
function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  if (!key || !url) throw new Error("File storage isn't configured on the server (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL).");
  return createClient(url, key, { auth: { persistSession: false } });
}

const bucketHint = (msg: string) =>
  /bucket not found/i.test(msg) ? `The private storage bucket "${JEE_RESOURCES_BUCKET}" doesn't exist yet — create it in Supabase (keep it private).` : msg;

/** Step 1 of an upload: validates the file's name/size/type and returns a one-time signed upload URL. */
export async function createUploadTarget(file: { fileName: string; sizeBytes: number; mimeType: string }) {
  const bad = validatePdfMeta({ name: file.fileName, size: file.sizeBytes, type: file.mimeType });
  if (bad) throw new Error(bad);
  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  // The random segment makes the path unguessable, and means two uploads can never collide.
  const path = `uploads/${rand}/${safeFileStem(file.fileName)}.pdf`;
  const { data, error } = await serviceClient().storage.from(JEE_RESOURCES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(bucketHint(error?.message ?? "Couldn't start the upload. Please try again."));
  return { path, signedUrl: data.signedUrl, token: data.token, bucket: JEE_RESOURCES_BUCKET };
}

/**
 * Step 2: after the browser has uploaded, confirm the object exists, is within the size limit and really
 * starts with a PDF header. Size comes from storage, never from the browser.
 */
export async function verifyUploadedPdf(path: string): Promise<{ sizeBytes: number }> {
  if (!UPLOAD_PATH_RE.test(path) || path.includes("..")) throw new Error("That upload isn't valid — please upload the PDF again.");
  const { data, error } = await serviceClient().storage.from(JEE_RESOURCES_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error("The uploaded file couldn't be found. Please upload it again.");
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-4" } });
  if (!res.ok || !res.body) throw new Error("The uploaded file couldn't be read. Please upload it again.");
  const reader = res.body.getReader();
  const { value } = await reader.read();
  void reader.cancel().catch(() => {});
  const range = res.headers.get("content-range"); // "bytes 0-4/12345" when the range was honoured
  const total = range ? Number(range.split("/")[1]) : Number(res.headers.get("content-length"));
  if (!value || !hasPdfMagic(value)) {
    await removeObject(path);
    throw new Error("That file isn't a valid PDF, so it was rejected. Export it as a PDF and upload again.");
  }
  if (!Number.isFinite(total) || total <= 0) throw new Error("Couldn't confirm the file size. Please upload it again.");
  if (total > MAX_JEE_RESOURCE_BYTES) {
    await removeObject(path);
    throw new Error("That file is too large.");
  }
  return { sizeBytes: total };
}

/** Best-effort delete of a storage object (used after a replace or delete, and for rejected uploads). */
export async function removeObject(path: string | null | undefined) {
  if (!path || path.includes("..")) return;
  try {
    await serviceClient().storage.from(JEE_RESOURCES_BUCKET).remove([path]);
  } catch (e) {
    console.error("[jee-resources] couldn't remove object", path, e);
  }
}

async function signedUrlFor(doc: { path?: string; fileName?: string }, mode: "preview" | "download"): Promise<string> {
  if (!doc.path) throw new Error("This file isn't available.");
  const opts = mode === "download" ? { download: doc.fileName || true } : undefined;
  const { data, error } = await serviceClient()
    .storage.from(JEE_RESOURCES_BUCKET)
    .createSignedUrl(doc.path, mode === "download" ? DOWNLOAD_URL_SECONDS : PREVIEW_URL_SECONDS, opts as any);
  if (error || !data?.signedUrl) {
    console.error("[jee-resources] createSignedUrl failed:", error?.message, { path: doc.path });
    throw new Error("This file couldn't be prepared right now. Please try again in a minute.");
  }
  return data.signedUrl;
}

// ── Student access (preview / download) ─────────────────────────────────────
async function oid(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("This file isn't available.");
  const { ObjectId } = await import("mongodb");
  return new ObjectId(id);
}

/**
 * The only place a published file's real location is released to a student. Signs first (so a file that
 * can't be served is never counted), then counts the event once per visitor per hour.
 */
export async function accessResource(opts: { resourceId: string; mode: "preview" | "download"; visitorId: string; uid: string | null }) {
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ _id: await oid(opts.resourceId), published: true, deletedAt: null });
  if (!doc) throw new Error("This file isn't available.");
  const url = await signedUrlFor(doc as any, opts.mode);

  const visitorId = clip(opts.visitorId, 80) || "unknown";
  const now = new Date();
  const events = db.collection(EVENTS);
  const repeat = await events.findOne(
    { resourceId: opts.resourceId, type: opts.mode, visitorId, at: { $gte: new Date(now.getTime() - DEDUPE_MS) } },
    { projection: { _id: 1 } },
  );
  if (!repeat) {
    await events.insertOne({ resourceId: opts.resourceId, type: opts.mode, subjectKey: doc.subjectKey, chapterSlug: doc.chapterSlug, visitorId, uid: opts.uid, at: now });
    await db.collection(COLLECTION).updateOne({ _id: doc._id }, { $inc: opts.mode === "download" ? { downloadCount: 1 } : { previewCount: 1 } });
  }
  return { url, fileName: (doc.fileName as string) || "resource.pdf" };
}

/** Admin-only preview link. Does not touch the counters. */
export async function adminFileUrl(id: string) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ _id: await oid(id), deletedAt: null });
  if (!doc) throw new Error("Resource not found.");
  return { url: await signedUrlFor(doc as any, "preview"), fileName: (doc.fileName as string) || "resource.pdf" };
}

// ── Writes ──────────────────────────────────────────────────────────────────
function dupMessage(e: unknown): Error {
  return (e as { code?: number })?.code === 11000 ? new Error("This upload was already saved — refresh the table to see it.") : (e as Error);
}

export async function createResource(input: JeeResourceInput, uid: string): Promise<{ id: string }> {
  await ensureIndexes();
  const meta = cleanMeta(input);
  const filePath = clip(input.filePath, 300);
  if (!filePath) throw new Error("Upload the PDF first.");
  const { sizeBytes } = await verifyUploadedPdf(filePath);
  const db = await getDb();
  const now = new Date();
  try {
    const r = await db.collection(COLLECTION).insertOne({
      ...meta,
      bucket: JEE_RESOURCES_BUCKET,
      path: filePath,
      fileName: clip(input.fileName, 160) || `${safeFileStem(meta.title)}.pdf`,
      mimeType: "application/pdf",
      sizeBytes,
      publishedAt: meta.published ? now : null,
      downloadCount: 0,
      previewCount: 0,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    invalidateSummary();
    return { id: String(r.insertedId) };
  } catch (e) {
    throw dupMessage(e);
  }
}

export async function updateResource(id: string, input: JeeResourceInput): Promise<{ replaced: boolean }> {
  await ensureIndexes();
  const meta = cleanMeta(input);
  const db = await getDb();
  const _id = await oid(id);
  const current = await db.collection(COLLECTION).findOne({ _id, deletedAt: null });
  if (!current) throw new Error("Resource not found.");

  const now = new Date();
  const set: Record<string, unknown> = { ...meta, updatedAt: now };
  // publishedAt = when it first went live in its current published stretch.
  if (meta.published && !current.published) set.publishedAt = now;
  if (!meta.published) set.publishedAt = null;

  const newPath = clip(input.filePath, 300);
  const replacing = !!newPath && newPath !== current.path;
  if (replacing) {
    const { sizeBytes } = await verifyUploadedPdf(newPath);
    Object.assign(set, {
      path: newPath,
      bucket: JEE_RESOURCES_BUCKET,
      fileName: clip(input.fileName, 160) || current.fileName,
      mimeType: "application/pdf",
      sizeBytes,
      fileReplacedAt: now,
    });
  }
  try {
    await db.collection(COLLECTION).updateOne({ _id, deletedAt: null }, { $set: set });
  } catch (e) {
    throw dupMessage(e);
  }
  // The record and its ID (and therefore every student-facing URL) stay the same; only the file behind it changes.
  invalidateSummary();
  if (replacing) await removeObject(current.path as string);
  return { replaced: replacing };
}

export async function setPublished(id: string, published: boolean) {
  const db = await getDb();
  const _id = await oid(id);
  const doc = await db.collection(COLLECTION).findOne({ _id, deletedAt: null });
  if (!doc) throw new Error("Resource not found.");
  if (published && doc.sourceConfirmed !== true) throw new Error("Open Edit and confirm the source/licensing box before publishing.");
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { _id, deletedAt: null },
    { $set: { published, updatedAt: now, publishedAt: published ? (doc.published ? doc.publishedAt : now) : null } },
  );
  invalidateSummary();
}

/** Soft delete: the record stops existing for everyone and its file is removed; nothing else is touched. */
export async function deleteResource(id: string) {
  const db = await getDb();
  const _id = await oid(id);
  const doc = await db.collection(COLLECTION).findOne({ _id, deletedAt: null });
  if (!doc) throw new Error("Resource not found.");
  await db.collection(COLLECTION).updateOne({ _id }, { $set: { deletedAt: new Date(), published: false, updatedAt: new Date() } });
  invalidateSummary();
  await removeObject(doc.path as string);
}

// ── Reads ───────────────────────────────────────────────────────────────────
export async function adminList(f: JeeAdminFilters): Promise<JeeAdminList> {
  await ensureIndexes();
  const db = await getDb();
  const c = db.collection(COLLECTION);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (isJeeSubject(f.subjectKey)) filter.subjectKey = f.subjectKey;
  if (f.chapterSlug && /^[a-z0-9-]{1,120}$/.test(f.chapterSlug)) filter.chapterSlug = f.chapterSlug;
  if (isJeeType(f.type)) filter.type = f.type;
  if (f.status === "published") filter.published = true;
  if (f.status === "draft") filter.published = false;
  const q = clip(f.q, 60);
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ title: rx }, { fileName: rx }, { description: rx }];
  }
  const page = Math.max(1, Math.trunc(f.page ?? 1) || 1);

  const [docs, total, sums, top] = await Promise.all([
    c.find(filter).sort({ createdAt: -1 }).skip((page - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).toArray(),
    c.countDocuments(filter),
    c
      .aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: null, resources: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ["$published", true] }, 1, 0] } }, downloads: { $sum: "$downloadCount" }, previews: { $sum: "$previewCount" } } },
      ])
      .toArray(),
    c.find({ deletedAt: null, $or: [{ downloadCount: { $gt: 0 } }, { previewCount: { $gt: 0 } }] }).sort({ downloadCount: -1, previewCount: -1 }).limit(5).toArray(),
  ]);
  const s = sums[0] ?? { resources: 0, published: 0, downloads: 0, previews: 0 };
  return {
    items: docs.map(toAdmin),
    total,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    totals: { resources: s.resources, published: s.published, drafts: s.resources - s.published, downloads: s.downloads, previews: s.previews },
    top: top.map((d) => ({ id: String(d._id), title: d.title ?? "", subjectKey: d.subjectKey, chapterSlug: d.chapterSlug, downloads: d.downloadCount ?? 0, previews: d.previewCount ?? 0 })),
  };
}

const libraryFilter = { published: true, deletedAt: null, exam: DEFAULT_JEE_EXAM, examYear: JEE_LIBRARY_YEAR };

// Entry points on the (otherwise static) JEE pages read this on every load, so keep it cheap: identical for
// every visitor, fine to be 30 s old, and reset on any admin write handled by this server instance.
let summaryCache = createTtlCache<JeeLibrarySummary>(30_000);
const invalidateSummary = () => { summaryCache = createTtlCache<JeeLibrarySummary>(30_000); };

/** Counts of PUBLISHED resources — drives entry points, empty states and sitemap inclusion. */
export async function librarySummary(): Promise<JeeLibrarySummary> {
  const hit = summaryCache.get("all");
  if (hit) return hit;
  const fresh = await computeSummary();
  summaryCache.set("all", fresh);
  return fresh;
}

async function computeSummary(): Promise<JeeLibrarySummary> {
  await ensureIndexes();
  const db = await getDb();
  const rows = await db
    .collection(COLLECTION)
    .aggregate([{ $match: libraryFilter }, { $group: { _id: { s: "$subjectKey", c: "$chapterSlug" }, n: { $sum: 1 }, updated: { $max: "$updatedAt" } } }])
    .toArray();
  const out: JeeLibrarySummary = { total: 0, bySubject: {}, byChapter: {}, lastUpdated: null };
  let latest = 0;
  for (const r of rows) {
    out.total += r.n;
    out.bySubject[r._id.s] = (out.bySubject[r._id.s] ?? 0) + r.n;
    out.byChapter[`${r._id.s}/${r._id.c}`] = r.n;
    const t = r.updated instanceof Date ? r.updated.getTime() : 0;
    if (t > latest) latest = t;
  }
  out.lastUpdated = latest ? new Date(latest).toISOString() : null;
  return out;
}

export async function chapterResources(subjectKey: string, chapterSlug: string): Promise<PublicJeeResource[]> {
  if (!isJeeSubject(subjectKey) || !getJeeChapter(subjectKey, chapterSlug)) return [];
  await ensureIndexes();
  const db = await getDb();
  const docs = await db.collection(COLLECTION).find({ ...libraryFilter, subjectKey, chapterSlug }).toArray();
  const rank = (t: string) => JEE_RESOURCE_TYPES.indexOf(t as JeeResourceType);
  return docs
    .sort((a, b) => rank(a.type) - rank(b.type) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || +new Date(a.createdAt) - +new Date(b.createdAt))
    .map(toPublic);
}
