// src/lib/jee-landing-types.ts
//
// Shared (client + server), pure types and helpers for the JEE Main 2027 landing page (/jee-main-2027).
// No server or browser imports, so it is safe in route heads, components and server code alike.
//
// The landing page owns no content of its own. Everything dynamic on it is read from systems that already
// exist and already enforce "published only":
//   • blog posts       → server-functions/blog-public.ts   (status "published", not soft-deleted)
//   • resource library → lib/jee-resource-core.ts          (published, not deleted, JEE Main 2027)
//   • PYQ question bank → lib/pyq-server.ts                (the same tree the /pyq page uses)
import type { PublicBlogPostSummary } from "@/lib/blog-types";
import type { JeeLibrarySummary, JeeResourceSubject, JeeResourceType } from "@/lib/jee-resource-types";

export const JEE_LANDING_PATH = "/jee-main-2027";

/**
 * What makes a blog post a "JEE post". One definition, shared by the landing-page query and the sitemap check,
 * so the two can never disagree. Matches how the blog already decides the JEE audience
 * (resolveBlogPromoAudience in blog-types.ts): exam tag "jee" OR the JEE Strategy category.
 */
// (Plain mutable array type on purpose: the MongoDB driver's Filter type does not accept a readonly $or.)
export const JEE_POST_CLASSIFIER: { $or: Record<string, string>[] } = { $or: [{ examKey: "jee" }, { category: "jeeStrategy" }] };

/** Blog category used for the "Latest updates" block. Everything else JEE-related goes under "Preparation guides". */
export const JEE_UPDATES_CATEGORY = "examNews" as const;

/** A chapter that really has published resources. Metadata only — never a file path, link or storage detail. */
export type JeeFeaturedChapter = {
  subjectKey: JeeResourceSubject;
  subjectName: string;
  chapterSlug: string;
  chapterName: string;
  /** Resource types that exist and are published for this chapter, in the library's display order. */
  types: JeeResourceType[];
  count: number;
};

export type JeeLandingBlog = {
  /** Published JEE posts in the Exam News category, newest first. */
  updates: PublicBlogPostSummary[];
  /** Other published JEE posts, newest first, never repeating anything in `updates`. */
  guides: PublicBlogPostSummary[];
  /** Number of published JEE posts in total (for the "view all" link and indexability). */
  total: number;
};

export type JeeLandingData = {
  summary: JeeLibrarySummary;
  featured: JeeFeaturedChapter[];
  blog: JeeLandingBlog;
  /** JEE questions currently in the PYQ bank (0 when none or when the count couldn't be read). */
  pyqTotal: number;
};

export const EMPTY_JEE_LANDING_BLOG: JeeLandingBlog = { updates: [], guides: [], total: 0 };

/**
 * The page is indexable when there is real content behind it. The static parts (syllabus, weightage and PYQ
 * links) are useful on their own, so one published resource, one published article or any JEE question is enough.
 * Only a completely empty state is kept out of search (and out of the sitemap).
 */
export const jeeLandingIndexable = (counts: { resources: number; posts: number; pyq: number }) => counts.resources > 0 || counts.posts > 0 || counts.pyq > 0;

/**
 * Picks up to `limit` rows, taking one from each subject in turn so Physics, Chemistry and Mathematics are
 * balanced where possible. `rows` must already be ordered best-first (newest first); that order is kept
 * within each subject. A subject with nothing simply drops out of the rotation.
 */
export function pickBalanced<T extends { subjectKey: string }>(rows: T[], subjectOrder: readonly string[], limit: number): T[] {
  const queues = subjectOrder.map((s) => rows.filter((r) => r.subjectKey === s));
  const out: T[] = [];
  for (let i = 0; out.length < limit; i++) {
    let took = false;
    for (const q of queues) {
      if (q[i] && out.length < limit) {
        out.push(q[i]);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}
