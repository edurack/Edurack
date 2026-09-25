// src/server-functions/blog-admin.ts
//
// Admin-side functions for the Blog module (renders as its own "Blog" tab
// in admin.dashboard.tsx). Deliberately its own file, not appended to
// admin.ts — same convention promoter-admin.ts and mentor-auth.ts already
// follow: this module's admin auth check is self-contained rather than
// imported from admin.ts, because requireAdmin (or requirePromoter, in the
// promoter build) must never be exported/imported cross-file between
// server-functions/*.ts files — doing so previously broke TanStack Start's
// client-bundle stripping of node:crypto. Every file duplicates its own
// private check instead.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { estimateReadingTimeMinutes } from "@/lib/blog-content";
import type { BlogPost, BlogPostInput, BlogPostStatus, BlogCategory } from "@/lib/blog-types";
import type { ExamKey, Track } from "@/lib/admin-types";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return null;
}

function mapDocToAdminPost(r: any): BlogPost {
  return {
    id: String(r._id),
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    status: (r.status as BlogPostStatus) ?? "draft",
    category: (r.category as BlogCategory) ?? "platformUpdates",
    tags: (r.tags as string[]) ?? [],
    examKey: (r.examKey as ExamKey | null) ?? null,
    track: (r.track as Track | null) ?? null,
    coverImageUrl: (r.coverImageUrl as string | null) ?? null,
    coverImageAlt: r.coverImageAlt ?? "",
    bodyMarkdown: r.bodyMarkdown ?? "",
    readingTimeMinutes: (r.readingTimeMinutes as number) ?? 1,
    author: r.author ?? { name: "Edurack Team", photoUrl: null, bio: null, mentorId: null },
    pinned: Boolean(r.pinned),
    relatedBundleId: (r.relatedBundleId as string | null) ?? null,
    relatedBatchId: (r.relatedBatchId as string | null) ?? null,
    seoTitleOverride: (r.seoTitleOverride as string | null) ?? null,
    seoDescriptionOverride: (r.seoDescriptionOverride as string | null) ?? null,
    viewCount: (r.viewCount as number) ?? 0,
    publishAt: toIso(r.publishAt),
    publishedAt: toIso(r.publishedAt),
    updatedAt: toIso(r.updatedAt),
    substantiveUpdate: Boolean(r.substantiveUpdate),
    deletedAt: toIso(r.deletedAt),
    createdAt: toIso(r.createdAt) ?? new Date().toISOString(),
  };
}

// ─── Slug availability ───────────────────────────────────────────────────
// Called by the editor as the admin types a title (client debounces this),
// and re-checked server-side on every save regardless — never trust a
// client-side-only uniqueness check for something a duplicate would
// silently corrupt (two posts serving from the same public URL, last
// write wins).
export const checkBlogSlugAvailable = createServerFn({ method: "POST" })
  .validator((data: { token: string; slug: string; excludeId?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    const query: Record<string, unknown> = { slug: data.slug };
    if (data.excludeId) query._id = { $ne: new ObjectId(data.excludeId) };
    const existing = await db.collection("blogPosts").findOne(query, { projection: { _id: 1 } });
    return { available: !existing };
  });

export const suggestBlogSlug = createServerFn({ method: "POST" })
  .validator((data: { token: string; title: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const base = slugify(data.title) || "post";
    let candidate = base;
    let n = 2;
    // Bounded loop — a runaway collision chain would mean something else
    // is badly wrong (e.g. the same title submitted in a tight loop), not
    // a case worth looping forever for.
    while (n < 50) {
      const existing = await db.collection("blogPosts").findOne({ slug: candidate }, { projection: { _id: 1 } });
      if (!existing) return { slug: candidate };
      candidate = `${base}-${n}`;
      n += 1;
    }
    return { slug: `${base}-${Date.now()}` };
  });

// ─── Create / update ──────────────────────────────────────────────────────
// Creating always lands as a draft — publishing is its own explicit,
// separate action (publishBlogPost below), never a side effect of saving.
export const createBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; post: BlogPostInput }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();

    const slug = slugify(data.post.slug || data.post.title);
    if (!slug) throw new Error("Title (or slug) is required.");
    const dupe = await db.collection("blogPosts").findOne({ slug }, { projection: { _id: 1 } });
    if (dupe) throw new Error(`Slug "${slug}" is already in use — pick another.`);

    const now = new Date();
    const result = await db.collection("blogPosts").insertOne({
      ...data.post,
      slug,
      status: "draft" satisfies BlogPostStatus,
      readingTimeMinutes: estimateReadingTimeMinutes(data.post.bodyMarkdown),
      viewCount: 0,
      publishAt: null,
      publishedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, id: String(result.insertedId) };
  });

export const updateBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; post: Partial<BlogPostInput> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const _id = new ObjectId(data.id);

    const existing = await db.collection("blogPosts").findOne({ _id });
    if (!existing) throw new Error("Post not found.");

    const patch: Record<string, unknown> = { ...data.post };

    // Slug immutability: once a post has ever been published, its slug is
    // locked. Silently ignoring a slug change here (rather than throwing)
    // means an admin editing other fields on a published post never gets
    // blocked by a stray/unintended slug diff from the form.
    if (typeof patch.slug === "string") {
      if (existing.publishedAt) {
        delete patch.slug;
      } else {
        const slug = slugify(patch.slug as string);
        const dupe = await db.collection("blogPosts").findOne({ slug, _id: { $ne: _id } }, { projection: { _id: 1 } });
        if (dupe) throw new Error(`Slug "${slug}" is already in use — pick another.`);
        patch.slug = slug;
      }
    }

    if (typeof patch.bodyMarkdown === "string") {
      patch.readingTimeMinutes = estimateReadingTimeMinutes(patch.bodyMarkdown);
    }

    // "substantiveUpdate" is the editor-ticked box deciding whether this
    // edit bumps the public "Updated <date>" badge. A typo fix shouldn't
    // make every reader think the post materially changed.
    patch.updatedAt = new Date();

    await db.collection("blogPosts").updateOne({ _id }, { $set: patch });
    return { ok: true };
  });

export const listBlogPostsAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const db = await getDb();
    const rows = await db
      .collection("blogPosts")
      .find({ deletedAt: null })
      .sort({ updatedAt: -1 })
      .toArray();
    return { posts: rows.map(mapDocToAdminPost) };
  });

export const getBlogPostAdmin = createServerFn({ method: "GET" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const row = await db.collection("blogPosts").findOne({ _id: new ObjectId(data.id) });
    if (!row) throw new Error("Post not found.");
    return { post: mapDocToAdminPost(row) };
  });

// ─── Lifecycle actions — each one deliberate and separate, never a side
// effect of a generic "save" ─────────────────────────────────────────────

function assertPublishReady(doc: any) {
  const missing: string[] = [];
  if (!doc.title?.trim()) missing.push("title");
  if (!doc.excerpt?.trim()) missing.push("excerpt");
  if (!doc.coverImageUrl) missing.push("cover image");
  if (!doc.coverImageAlt?.trim()) missing.push("cover image alt text");
  if (!doc.bodyMarkdown?.trim()) missing.push("body");
  if (missing.length > 0) {
    throw new Error(`Can't publish — missing: ${missing.join(", ")}.`);
  }
}

export const publishBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const _id = new ObjectId(data.id);
    const doc = await db.collection("blogPosts").findOne({ _id });
    if (!doc) throw new Error("Post not found.");
    assertPublishReady(doc);

    const now = new Date();
    await db.collection("blogPosts").updateOne(
      { _id },
      {
        $set: {
          status: "published" satisfies BlogPostStatus,
          publishAt: null,
          updatedAt: now,
          // Never overwrite an existing publishedAt — that's the post's
          // one true "went live" timestamp, even across later edits or a
          // draft→archive→republish cycle.
          ...(doc.publishedAt ? {} : { publishedAt: now }),
        },
      },
    );
    return { ok: true };
  });

export const scheduleBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; publishAt: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const _id = new ObjectId(data.id);
    const doc = await db.collection("blogPosts").findOne({ _id });
    if (!doc) throw new Error("Post not found.");
    assertPublishReady(doc);

    const when = new Date(data.publishAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new Error("Pick a publish time in the future.");
    }

    await db.collection("blogPosts").updateOne(
      { _id },
      { $set: { status: "scheduled" satisfies BlogPostStatus, publishAt: when, updatedAt: new Date() } },
    );
    return { ok: true };
  });

export const revertBlogPostToDraft = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("blogPosts").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { status: "draft" satisfies BlogPostStatus, publishAt: null, updatedAt: new Date() } },
    );
    return { ok: true };
  });

export const archiveBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("blogPosts").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { status: "archived" satisfies BlogPostStatus, updatedAt: new Date() } },
    );
    return { ok: true };
  });

// Soft delete only — never hard-delete a post that was ever published. A
// deleted post's slug stays reserved (still blocks reuse in the slug
// uniqueness check above) so an old inbound link can later be pointed at
// a proper redirect instead of colliding with an unrelated new post.
export const softDeleteBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("blogPosts").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { deletedAt: new Date(), updatedAt: new Date() } },
    );
    return { ok: true };
  });

export const restoreBlogPost = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    await db.collection("blogPosts").updateOne(
      { _id: new ObjectId(data.id) },
      { $set: { deletedAt: null, updatedAt: new Date() } },
    );
    return { ok: true };
  });

// ─── Scheduled-publish sweep ──────────────────────────────────────────────
// NOT a createServerFn — this is called from a thin cron route
// (src/routes/cron.blog-publish.ts), the same "Vercel Cron hits a route
// that calls a plain exported function" shape session-reminders.ts already
// uses, not a client-callable action. Idempotent: re-running it mid-window
// just finds nothing due and does nothing, so a missed or doubled-up cron
// tick is harmless — "publish anything due, whenever we next check," not a
// promise of exact-time firing.
export async function publishDueScheduledPosts(): Promise<{ published: number }> {
  const db = await getDb();
  const now = new Date();
  const due = await db
    .collection("blogPosts")
    .find({ status: "scheduled", publishAt: { $lte: now }, deletedAt: null })
    .toArray();

  for (const doc of due) {
    await db.collection("blogPosts").updateOne(
      { _id: doc._id },
      {
        $set: {
          status: "published" satisfies BlogPostStatus,
          publishAt: null,
          updatedAt: now,
          ...(doc.publishedAt ? {} : { publishedAt: now }),
        },
      },
    );
  }
  return { published: due.length };
}
