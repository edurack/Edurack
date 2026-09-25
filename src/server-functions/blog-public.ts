// src/server-functions/blog-public.ts
//
// Public reads only — no admin token, callable from anyone's browser. The
// one rule every function here must never break: a draft, scheduled,
// archived, or soft-deleted post must NEVER be returned, and a lookup that
// finds one must respond exactly like it found nothing at all — same
// status, same shape — so a guessed or leaked slug can't be used to tell
// "doesn't exist" apart from "exists but isn't public yet."
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import type { BlogCategory, PublicBlogPost, PublicBlogPostSummary } from "@/lib/blog-types";
import type { ExamKey } from "@/lib/admin-types";

const PUBLISHED_FILTER = { status: "published", deletedAt: null } as const;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return null;
}

function mapToSummary(r: any): PublicBlogPostSummary {
  return {
    id: String(r._id),
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    category: r.category as BlogCategory,
    tags: (r.tags as string[]) ?? [],
    examKey: (r.examKey as ExamKey | null) ?? null,
    track: r.track ?? null,
    coverImageUrl: (r.coverImageUrl as string | null) ?? null,
    coverImageAlt: r.coverImageAlt ?? "",
    readingTimeMinutes: (r.readingTimeMinutes as number) ?? 1,
    author: r.author ?? { name: "Edurack Team", photoUrl: null, bio: null, mentorId: null },
    pinned: Boolean(r.pinned),
    relatedBundleId: (r.relatedBundleId as string | null) ?? null,
    relatedBatchId: (r.relatedBatchId as string | null) ?? null,
    viewCount: (r.viewCount as number) ?? 0,
    publishedAt: toIso(r.publishedAt),
    updatedAt: toIso(r.updatedAt),
    substantiveUpdate: Boolean(r.substantiveUpdate),
  };
}

function mapToFull(r: any): PublicBlogPost {
  const summary = mapToSummary(r);
  return {
    ...summary,
    bodyMarkdown: r.bodyMarkdown ?? "",
    seoTitle: (r.seoTitleOverride as string) || r.title,
    seoDescription: (r.seoDescriptionOverride as string) || r.excerpt || "",
  };
}

const PAGE_SIZE = 12;

export const listPublishedPosts = createServerFn({ method: "GET" })
  .validator((data: { page?: number; category?: BlogCategory; examKey?: ExamKey } = {}) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const page = Math.max(1, data.page ?? 1);

    const query: Record<string, unknown> = { ...PUBLISHED_FILTER };
    if (data.category) query.category = data.category;
    if (data.examKey) query.examKey = data.examKey;

    const [rows, total, pinned] = await Promise.all([
      db
        .collection("blogPosts")
        .find(query)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
      db.collection("blogPosts").countDocuments(query),
      page === 1 && !data.category && !data.examKey
        ? db.collection("blogPosts").findOne({ ...PUBLISHED_FILTER, pinned: true })
        : Promise.resolve(null),
    ]);

    return {
      posts: rows.map(mapToSummary),
      pinned: pinned ? mapToSummary(pinned) : null,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  });

// Used by the SSR route loader for /blog/$slug — must be a full, deliberate
// "is this actually public right now" check, not just "find by slug."
export const getPublishedPostBySlug = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const row = await db.collection("blogPosts").findOne({ slug: data.slug, ...PUBLISHED_FILTER });
    if (!row) return { post: null };
    return { post: mapToFull(row) };
  });

export const listRelatedPosts = createServerFn({ method: "GET" })
  .validator((data: { postId: string; category: BlogCategory; examKey?: ExamKey | null }) => data)
  .handler(async ({ data }) => {
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    // Same category first; top up with same-exam posts if the category
    // alone doesn't yield enough — a niche category (e.g. ipmatStrategy)
    // shouldn't leave the rail looking sparse when there's decent
    // same-exam content available instead.
    const byCategory = await db
      .collection("blogPosts")
      .find({ ...PUBLISHED_FILTER, category: data.category, _id: { $ne: new ObjectId(data.postId) } })
      .sort({ publishedAt: -1 })
      .limit(4)
      .toArray();

    let combined = byCategory;
    if (combined.length < 4 && data.examKey) {
      const seen = new Set(combined.map((r) => String(r._id)));
      const byExam = await db
        .collection("blogPosts")
        .find({
          ...PUBLISHED_FILTER,
          examKey: data.examKey,
          _id: { $ne: new ObjectId(data.postId), $nin: [...seen].map((id) => new ObjectId(id)) },
        })
        .sort({ publishedAt: -1 })
        .limit(4 - combined.length)
        .toArray();
      combined = [...combined, ...byExam];
    }

    return { posts: combined.slice(0, 4).map(mapToSummary) };
  });

// Throttled to once per (post, browser) per call from the client — the
// client only calls this once per page view (see routes/blog/$slug.tsx),
// so no server-side session tracking is needed for this simple a counter.
// Good enough for an admin-facing "top posts" sort; not meant to survive
// deliberate refresh-spam the way a real analytics pipeline would guard
// against.
export const incrementBlogViewCount = createServerFn({ method: "POST" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.collection("blogPosts").updateOne(
      { slug: data.slug, ...PUBLISHED_FILTER },
      { $inc: { viewCount: 1 } },
    );
    return { ok: true };
  });
