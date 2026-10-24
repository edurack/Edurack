// src/lib/jee-landing-core.ts
//
// SERVER-ONLY. Cheap "how much real content is there" counts for the JEE Main 2027 landing page. Used by the
// sitemap (to list the page only when it is indexable) so it applies the exact same rule as the page's own
// <head>. Every number comes from an existing source of truth and an existing published-only filter.
import { getDb } from "@/lib/mongo";
import { librarySummary } from "@/lib/jee-resource-core";
import { loadTreeRows } from "@/lib/pyq-server";
import { JEE_POST_CLASSIFIER } from "@/lib/jee-landing-types";

/** Total JEE questions in the PYQ bank. Reuses the PYQ page's own (10-minute cached) tree, so no extra query. */
export async function jeePyqTotal(): Promise<number> {
  const db = await getDb();
  const rows = await loadTreeRows(db, "jee");
  return rows.reduce((n, r) => n + r.count, 0);
}

/**
 * Published JEE posts: how many, and when the newest was published or edited. Same published rule as
 * blog-public.ts (status "published", not soft-deleted) plus the shared JEE classifier.
 */
export async function jeePostStats(): Promise<{ total: number; latestAt: string | null }> {
  const db = await getDb();
  const filter = { status: "published", deletedAt: null, ...JEE_POST_CLASSIFIER };
  const col = db.collection("blogPosts");
  const [total, latest] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).project({ publishedAt: 1, updatedAt: 1 }).sort({ publishedAt: -1 }).limit(1).toArray(),
  ]);
  const t = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) || 0 : 0);
  const newest = latest[0] ? Math.max(t(latest[0].publishedAt), t(latest[0].updatedAt)) : 0;
  return { total, latestAt: newest ? new Date(newest).toISOString() : null };
}

/** Everything the sitemap needs to decide whether, and with what lastmod, to list /jee-main-2027. Throws on a DB failure. */
export async function jeeLandingMeta(): Promise<{ resources: number; posts: number; pyq: number; lastmod: string | null }> {
  const [sum, posts, pyq] = await Promise.all([librarySummary(), jeePostStats(), jeePyqTotal()]);
  const times = [sum.lastUpdated, posts.latestAt].filter((x): x is string => !!x).map((x) => Date.parse(x));
  return { resources: sum.total, posts: posts.total, pyq, lastmod: times.length ? new Date(Math.max(...times)).toISOString() : null };
}
