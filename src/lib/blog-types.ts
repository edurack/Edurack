// src/lib/blog-types.ts
//
// Shared type system for the Blog feature. Deliberately its own file, not
// appended to admin-types.ts — every promoter-related file stayed
// independent per project convention (see promoter-types.ts), and blog
// follows the same rule: its own types file, its own server-function
// files, its own admin auth check duplicated in-file rather than imported.

import type { ExamKey, Track } from "@/lib/admin-types";

export type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";

// Fixed, admin-controlled set — deliberately not free-form. Add a new
// category here (and in BLOG_CATEGORY_LABELS below) when the editorial
// team actually needs one; an unbounded category list is how taxonomy
// sprawls into uselessness within a few months.
export type BlogCategory =
  | "neetStrategy"
  | "jeeStrategy"
  | "cuetStrategy"
  | "ipmatStrategy"
  | "mentorStories"
  | "platformUpdates"
  | "examNews";

export const BLOG_CATEGORIES: BlogCategory[] = [
  "neetStrategy",
  "jeeStrategy",
  "cuetStrategy",
  "ipmatStrategy",
  "mentorStories",
  "platformUpdates",
  "examNews",
];

export const BLOG_CATEGORY_LABELS: Record<BlogCategory, string> = {
  neetStrategy: "NEET Strategy",
  jeeStrategy: "JEE Strategy",
  cuetStrategy: "CUET Strategy",
  ipmatStrategy: "IPMAT Strategy",
  mentorStories: "Mentor Stories",
  platformUpdates: "Platform Updates",
  examNews: "Exam News",
};

// Denormalized byline — a snapshot taken at publish time, not a live join
// against a mentor/admin record. This is deliberate: it means a later
// change to a mentor's bio, or that mentor account being deleted, never
// silently rewrites (or breaks) a post that already credits them.
export type BlogAuthor = {
  name: string;
  photoUrl: string | null;
  bio: string | null;
  mentorId: string | null; // optional link back to an existing mentor profile
};

export type BlogPost = {
  id: string;
  slug: string; // immutable after first publish — see requestSlugChange note in blog-admin.ts
  title: string;
  excerpt: string;
  status: BlogPostStatus;
  category: BlogCategory;
  tags: string[];
  examKey: ExamKey | null;
  track: Track | null;

  coverImageUrl: string | null;
  coverImageAlt: string;
  bodyMarkdown: string;
  readingTimeMinutes: number; // computed server-side at save, not on every render

  author: BlogAuthor;

  pinned: boolean;
  relatedBundleId: string | null;
  relatedBatchId: string | null;

  seoTitleOverride: string | null;
  seoDescriptionOverride: string | null;

  viewCount: number;

  publishAt: string | null; // ISO — set only while status === "scheduled"
  publishedAt: string | null; // ISO — set once, on first publish, never moved on edit
  updatedAt: string | null;
  substantiveUpdate: boolean; // editor-controlled: does this edit bump the public "Updated" badge?
  deletedAt: string | null; // soft delete — never hard-delete a post that was ever published

  createdAt: string;
};

// What the admin editor form actually submits. Server fills in id,
// createdAt, viewCount, publishedAt, readingTimeMinutes.
export type BlogPostInput = {
  title: string;
  slug: string;
  excerpt: string;
  category: BlogCategory;
  tags: string[];
  examKey: ExamKey | null;
  track: Track | null;
  coverImageUrl: string | null;
  coverImageAlt: string;
  bodyMarkdown: string;
  author: BlogAuthor;
  pinned: boolean;
  relatedBundleId: string | null;
  relatedBatchId: string | null;
  seoTitleOverride: string | null;
  seoDescriptionOverride: string | null;
  substantiveUpdate: boolean;
};

// The subset the public site is ever allowed to receive. blog-public.ts
// projects down to exactly this shape — never spread a raw Mongo document
// into a public response, so a field added later for admin-only use (e.g.
// an internal note) can't leak by accident.
export type PublicBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  tags: string[];
  examKey: ExamKey | null;
  track: Track | null;
  coverImageUrl: string | null;
  coverImageAlt: string;
  bodyMarkdown: string;
  readingTimeMinutes: number;
  author: BlogAuthor;
  pinned: boolean;
  relatedBundleId: string | null;
  relatedBatchId: string | null;
  seoTitle: string; // resolved: override ?? title
  seoDescription: string; // resolved: override ?? excerpt
  viewCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
  substantiveUpdate: boolean;
};

// Lightweight card shape for index/related-posts grids — avoids shipping
// the full markdown body to a page that only renders a thumbnail grid.
export type PublicBlogPostSummary = Omit<PublicBlogPost, "bodyMarkdown" | "seoTitle" | "seoDescription">;

export type BlogRevision = {
  id: string;
  postId: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  savedAt: string;
};


// ─── Free-test popup ───────────────────────────────────────────────────────
// A popup shown ~10 seconds after a blog page loads, nudging readers toward
// the free test series. Three audiences: JEE posts see the JEE link, NEET
// posts the NEET link, everything else (CUET/IPMAT/general posts and the blog
// index) the general one. Edited from the admin Blog tab.
export type BlogPromoAudience = "jee" | "neet" | "general";

export const BLOG_PROMO_AUDIENCES: BlogPromoAudience[] = ["jee", "neet", "general"];

export const BLOG_PROMO_AUDIENCE_LABELS: Record<BlogPromoAudience, string> = {
  jee: "JEE blogs",
  neet: "NEET blogs",
  general: "General (all other blogs + blog home)",
};

export type BlogPromoConfig = {
  enabled: boolean;
  url: string; // "/..." internal path or "https://..." external link
  title: string;
  message: string;
  buttonLabel: string;
};

export type BlogPromoSettings = Record<BlogPromoAudience, BlogPromoConfig>;

export const BLOG_PROMO_DELAY_MS = 10_000;

export const DEFAULT_BLOG_PROMO_SETTINGS: BlogPromoSettings = {
  jee: {
    enabled: false,
    url: "",
    title: "Free JEE test series is live",
    message: "Try a free JEE test on Edurack and see where you stand — no payment needed.",
    buttonLabel: "Take a free JEE test",
  },
  neet: {
    enabled: false,
    url: "",
    title: "Free NEET test series is live",
    message: "Try a free NEET test on Edurack and see where you stand — no payment needed.",
    buttonLabel: "Take a free NEET test",
  },
  general: {
    enabled: false,
    url: "",
    title: "Free test series is available",
    message: "Try a free test series on Edurack and check your preparation for yourself.",
    buttonLabel: "Try it free",
  },
};

// Which audience a given page belongs to. Post pages pass their own
// examKey/category; the blog index passes whatever filter is active.
export function resolveBlogPromoAudience(input: {
  examKey?: string | null;
  category?: string | null;
}): BlogPromoAudience {
  if (input.examKey === "jee" || input.category === "jeeStrategy") return "jee";
  if (input.examKey === "neet" || input.category === "neetStrategy") return "neet";
  return "general";
}
