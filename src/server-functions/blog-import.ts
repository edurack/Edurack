// Admin-only bulk import of blog posts from JSON (always lands as DRAFTS —
// nothing goes public until you publish/schedule from the Blog list).
// Self-contained auth, same convention as blog-admin.ts.
import { createServerFn } from "@tanstack/react-start";
import { logAdminAction } from "@/lib/team-core";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { estimateReadingTimeMinutes } from "@/lib/blog-content";
import { BLOG_CATEGORIES } from "@/lib/blog-types";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown, max: number) => { const s = str(v, max); return s ? s : null; };

export type BlogImportResult = { slug: string; title: string; status: "created" | "skipped" | "invalid"; reason?: string };

export const importBlogPosts = createServerFn({ method: "POST" })
  .validator((data: { token: string; posts: unknown[]; dryRun?: boolean }) => data)
  .handler(async ({ data }): Promise<{ results: BlogImportResult[] }> => {
    await requireAdmin(data.token);
    if (!Array.isArray(data.posts) || data.posts.length === 0) throw new Error("No posts found in that JSON.");
    if (data.posts.length > 60) throw new Error("Import at most 60 posts at a time.");
    if (!data.dryRun) await logAdminAction(data.token, "importBlogPosts", { count: data.posts.length }, "Blog");
    const db = await getDb();
    const col = db.collection("blogPosts");

    const wanted = data.posts.map((p) => slugify(str((p as any)?.slug, 120) || str((p as any)?.title, 120)));
    const existing = new Set((await col.find({ slug: { $in: wanted.filter(Boolean) } }, { projection: { slug: 1 } }).toArray()).map((d) => d.slug as string));
    const seen = new Set<string>();

    const results: BlogImportResult[] = [];
    const docs: Record<string, unknown>[] = [];
    const now = new Date();

    data.posts.forEach((raw, i) => {
      const p = (raw ?? {}) as Record<string, any>;
      const title = str(p.title, 140);
      const slug = wanted[i];
      const body = typeof p.bodyMarkdown === "string" ? p.bodyMarkdown : "";
      if (!title || !slug || body.trim().length < 50) return void results.push({ slug: slug || `#${i + 1}`, title: title || "(no title)", status: "invalid", reason: "Needs a title, slug and bodyMarkdown." });
      if (existing.has(slug) || seen.has(slug)) return void results.push({ slug, title, status: "skipped", reason: "Slug already exists." });
      seen.add(slug);

      const category = BLOG_CATEGORIES.includes(p.category) ? p.category : "neetStrategy";
      const examKey = ["neet", "jee", "cuet", "ipmat"].includes(p.examKey) ? p.examKey : null;
      const track = ["11th", "12th", "Dropper", "All"].includes(p.track) ? p.track : null;
      const a = (p.author ?? {}) as Record<string, any>;
      docs.push({
        title, slug,
        excerpt: str(p.excerpt, 300),
        category,
        tags: Array.isArray(p.tags) ? p.tags.map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 10) : [],
        examKey, track,
        coverImageUrl: strOrNull(p.coverImageUrl, 600),
        coverImageAlt: str(p.coverImageAlt, 200),
        bodyMarkdown: body,
        author: { name: str(a.name, 80) || "Edurack Team", photoUrl: strOrNull(a.photoUrl, 600), bio: strOrNull(a.bio, 300), mentorId: null },
        pinned: false,
        relatedBundleId: null, relatedBatchId: null,
        documents: [],
        seoTitleOverride: strOrNull(p.seoTitleOverride, 70),
        seoDescriptionOverride: strOrNull(p.seoDescriptionOverride, 200),
        substantiveUpdate: false,
        status: "draft",
        readingTimeMinutes: estimateReadingTimeMinutes(body),
        viewCount: 0, publishAt: null, publishedAt: null, deletedAt: null,
        createdAt: now, updatedAt: now,
      });
      results.push({ slug, title, status: "created" });
    });

    if (!data.dryRun && docs.length) await col.insertMany(docs);
    return { results };
  });
