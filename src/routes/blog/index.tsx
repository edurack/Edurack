// src/routes/blog/index.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { listPublishedPosts } from "@/server-functions/blog-public";
import { BLOG_CATEGORIES, BLOG_CATEGORY_LABELS } from "@/lib/blog-types";
import type { BlogCategory, PublicBlogPostSummary } from "@/lib/blog-types";
import { EXAM_KEYS, EXAM_LABELS } from "@/lib/admin-types";
import type { ExamKey } from "@/lib/admin-types";

type BlogSearch = { category?: BlogCategory; examKey?: ExamKey; page?: number };

export const Route = createFileRoute("/blog/")({
  validateSearch: (search: Record<string, unknown>): BlogSearch => ({
    category: BLOG_CATEGORIES.includes(search.category as BlogCategory) ? (search.category as BlogCategory) : undefined,
    examKey: EXAM_KEYS.includes(search.examKey as ExamKey) ? (search.examKey as ExamKey) : undefined,
    page: typeof search.page === "number" ? search.page : Number(search.page) || undefined,
  }),
  loader: async ({ location }) => {
    const search = location.search as BlogSearch;
    return listPublishedPosts({ data: { category: search.category, examKey: search.examKey, page: search.page ?? 1 } });
  },
  head: () => ({
    meta: [
      { title: "Blog · Edurack" },
      { name: "description", content: "NEET, JEE, CUET and IPMAT prep strategy, mentor stories, and platform updates from the Edurack team." },
      { property: "og:title", content: "Edurack Blog" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listPublishedPosts({ data: { category: search.category, examKey: search.examKey, page: search.page ?? 1 } })
      .then(setData)
      .finally(() => setLoading(false));
  }, [search.category, search.examKey, search.page]);

  function setFilter(patch: Partial<BlogSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }) });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Edurack Blog</h1>
        <p className="mt-1 text-sm text-foreground/60">Exam strategy, mentor stories, and what's new on the platform.</p>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <FilterChip active={!search.category} onClick={() => setFilter({ category: undefined })}>
          All
        </FilterChip>
        {BLOG_CATEGORIES.map((c) => (
          <FilterChip key={c} active={search.category === c} onClick={() => setFilter({ category: c })}>
            {BLOG_CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-foreground/10" />
        <FilterChip active={!search.examKey} onClick={() => setFilter({ examKey: undefined })}>
          Any exam
        </FilterChip>
        {EXAM_KEYS.map((k) => (
          <FilterChip key={k} active={search.examKey === k} onClick={() => setFilter({ examKey: k })}>
            {EXAM_LABELS[k]}
          </FilterChip>
        ))}
      </div>

      {data.pinned && (
        <Link to="/blog/$slug" params={{ slug: data.pinned.slug }} className="clay mb-8 flex flex-col overflow-hidden sm:flex-row">
          {data.pinned.coverImageUrl && (
            <img src={data.pinned.coverImageUrl} alt={data.pinned.coverImageAlt} className="h-48 w-full object-cover sm:h-auto sm:w-64" />
          )}
          <div className="p-6">
            <span className="clay-chip inline-block rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/60">Featured</span>
            <p className="mt-2 text-lg font-bold text-foreground">{data.pinned.title}</p>
            <p className="mt-1 text-sm text-foreground/60">{data.pinned.excerpt}</p>
          </div>
        </Link>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-foreground/40">Loading…</div>
      ) : data.posts.length === 0 ? (
        <div className="clay p-10 text-center text-sm text-foreground/60">No posts here yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            disabled={(search.page ?? 1) <= 1}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }) })}
            className="clay-chip rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-foreground/50">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            disabled={(search.page ?? 1) >= data.totalPages}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }) })}
            className="clay-chip rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "bg-foreground text-background" : "clay-chip text-foreground/60"
      }`}
    >
      {children}
    </button>
  );
}

function PostCard({ post }: { post: PublicBlogPostSummary }) {
  return (
    <Link to="/blog/$slug" params={{ slug: post.slug }} className="clay flex flex-col overflow-hidden">
      {post.coverImageUrl && <img src={post.coverImageUrl} alt={post.coverImageAlt} className="aspect-video w-full object-cover" />}
      <div className="flex flex-1 flex-col p-4">
        <span className="text-[11px] font-semibold text-foreground/50">{BLOG_CATEGORY_LABELS[post.category]}</span>
        <p className="mt-1.5 line-clamp-2 text-sm font-bold text-foreground">{post.title}</p>
        <p className="mt-1.5 line-clamp-2 flex-1 text-xs text-foreground/60">{post.excerpt}</p>
        <p className="mt-3 text-[11px] text-foreground/40">{post.readingTimeMinutes} min read</p>
      </div>
    </Link>
  );
}
