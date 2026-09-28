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
import { getCurrentRequest } from "@/lib/get-request";
import type { BlogCategory, BlogPromoAudience, BlogPromoConfig, PublicBlogPost, PublicBlogPostSummary } from "@/lib/blog-types";
import { DEFAULT_BLOG_PROMO_SETTINGS } from "@/lib/blog-types";
import type { ExamKey } from "@/lib/admin-types";

// Same header-based lookup used for session/device tracking elsewhere
// (see server-functions/sessions.ts) — the IP is read server-side from
// the request, never trusted from the client body.
function getClientIp(): string {
  const request = getCurrentRequest();
  return (
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    "unknown"
  );
}


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
// De-duplicated by IP, read server-side from the request headers — never
// trusted from the client body, since a client could otherwise claim any
// IP it likes and inflate the count. The client still only calls this
// once per page view (see routes/blog/$slug.tsx), but the dedup is what
// actually stops the same visitor refreshing (or a bot hitting the page
// on a loop) from moving the number: a doc is written to blogPostViews
// keyed on (slug, ip), and the post's viewCount is only incremented the
// first time that pair is seen. Good enough for an admin-facing "top
// posts" / unique-visitor sort; a visitor behind a shared or rotating IP
// (office NAT, mobile carrier, VPN) will still only ever count once from
// that address — the standard, accepted trade-off of IP-based counting,
// not meant to replace a real analytics pipeline with cookies/device IDs.
export const incrementBlogViewCount = createServerFn({ method: "POST" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const ip = getClientIp();
    const userAgent = getCurrentRequest()?.headers.get("user-agent") ?? "unknown";
    const now = new Date();

    // Only count a post that's actually public right now — same rule as
    // every other read in this file.
    const post = await db.collection("blogPosts").findOne(
      { slug: data.slug, ...PUBLISHED_FILTER },
      { projection: { _id: 1 } },
    );
    if (!post) return { ok: true };

    const viewResult = await db.collection("blogPostViews").updateOne(
      { slug: data.slug, ip },
      {
        $setOnInsert: { slug: data.slug, ip, userAgent, firstViewedAt: now },
        $set: { lastViewedAt: now },
        $inc: { hitCount: 1 },
      },
      { upsert: true },
    );

    // upsertedCount === 1 means this (slug, ip) pair didn't exist before
    // this call — i.e. this is the first time this IP has viewed this
    // post, so it's the moment (and the only moment) the public counter
    // moves.
    if (viewResult.upsertedCount > 0) {
      await db.collection("blogPosts").updateOne(
        { slug: data.slug, ...PUBLISHED_FILTER },
        { $inc: { viewCount: 1 } },
      );
    }

    return { ok: true };
  });

// ─── Free-test popup (public) ─────────────────────────────────────────────
// Returns the popup config for one audience, or null when nothing should be
// shown. A JEE/NEET audience with no usable link of its own falls back to the
// "general" popup, so switching on just the general one still covers every
// blog page until a dedicated link is added.
function usablePromo(c: any): BlogPromoConfig | null {
  if (!c?.enabled || typeof c.url !== "string" || !c.url) return null;
  const okUrl = (c.url.startsWith("/") && !c.url.startsWith("//")) || /^https:\/\//i.test(c.url);
  if (!okUrl) return null;
  const d = DEFAULT_BLOG_PROMO_SETTINGS.general;
  return {
    enabled: true,
    url: c.url,
    title: c.title || d.title,
    message: c.message || d.message,
    buttonLabel: c.buttonLabel || d.buttonLabel,
  };
}

export const getBlogPromoPopup = createServerFn({ method: "GET" })
  .validator((data: { audience: BlogPromoAudience }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const doc = await db.collection("blogSettings").findOne({ _id: "promoPopup" } as any);
    const s = doc?.settings ?? {};
    const audience: BlogPromoAudience = ["jee", "neet", "general"].includes(data.audience) ? data.audience : "general";
    const popup = usablePromo(s[audience]) ?? (audience !== "general" ? usablePromo(s.general) : null);
    return { popup };
  });
