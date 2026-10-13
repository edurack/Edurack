// src/routes/blog/index.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { pageHead } from "@/lib/seo";
import { listPublishedPosts } from "@/server-functions/blog-public";
import { BLOG_CATEGORIES, BLOG_CATEGORY_LABELS, resolveBlogPromoAudience } from "@/lib/blog-types";
import type { BlogCategory, PublicBlogPostSummary } from "@/lib/blog-types";
import { EXAM_KEYS, EXAM_LABELS } from "@/lib/admin-types";
import { FreeTestPopup } from "@/components/blog/free-test-popup";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { BlogCallbackSection } from "@/components/blog/blog-callback-section";
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
  // Canonical is always plain /blog: the ?category / ?examKey / ?page
  // variants are filtered views of the same list, not separate pages.
  head: () =>
    pageHead({
      title: "Exam Prep Blog: NEET, JEE, CUET & IPMAT",
      description:
        "Study strategy, exam analysis, mentor stories and platform updates for NEET, JEE, CUET and IPMAT aspirants, from the Edurack team.",
      path: "/blog",
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
    <>
    <SiteHeader backLabel="Back to home" />
    <div className="mx-auto max-w-5xl px-4 py-14">
      {/* Filtering by JEE/NEET switches to that exam's link; otherwise general. */}
      <FreeTestPopup audience={resolveBlogPromoAudience({ examKey: search.examKey, category: search.category })} />
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Edurack Blog</h1>
        <p className="mt-1 text-sm text-foreground/60">Exam strategy, mentor stories, and what's new on the platform.</p>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
          <FilterChip active={!search.category} onClick={() => setFilter({ category: undefined })}>
            All
          </FilterChip>
          {BLOG_CATEGORIES.map((c) => (
            <FilterChip key={c} active={search.category === c} onClick={() => setFilter({ category: c })}>
              {BLOG_CATEGORY_LABELS[c]}
            </FilterChip>
          ))}
        </div>
        <span className="hidden h-4 w-px bg-foreground/10 sm:block" aria-hidden="true" />
        <div role="group" aria-label="Filter by exam" className="flex flex-wrap items-center gap-2">
          <FilterChip active={!search.examKey} onClick={() => setFilter({ examKey: undefined })}>
            Any exam
          </FilterChip>
          {EXAM_KEYS.map((k) => (
            <FilterChip key={k} active={search.examKey === k} onClick={() => setFilter({ examKey: k })}>
              {EXAM_LABELS[k]}
            </FilterChip>
          ))}
        </div>
      </div>

      {data.featured.length > 0 && (
        <div className={`mb-8 grid gap-5 ${data.featured.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          {data.featured.map((f) => (
            <Link
              key={f.id}
              to="/blog/$slug"
              params={{ slug: f.slug }}
              className={`clay flex flex-col overflow-hidden ${data.featured.length === 1 ? "sm:flex-row" : ""}`}
            >
              {f.coverImageUrl && (
                <img
                  src={f.coverImageUrl}
                  alt={f.coverImageAlt}
                  className={`w-full object-cover ${data.featured.length === 1 ? "h-48 sm:h-auto sm:w-64" : "aspect-video"}`}
                />
              )}
              <div className="p-6">
                <span className="clay-chip inline-block rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/60">Featured</span>
                <p className="mt-2 text-lg font-bold text-foreground">{f.title}</p>
                <p className="mt-1 line-clamp-3 text-sm text-foreground/60">{f.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-foreground/40" role="status" aria-live="polite">
          Loading…
        </div>
      ) : data.posts.length === 0 ? (
        <div className="clay p-10 text-center text-sm text-foreground/60" role="status" aria-live="polite">
          No posts here yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
          <button
            disabled={(search.page ?? 1) <= 1}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }) })}
            className="clay-chip rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-foreground/50" aria-live="polite">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            disabled={(search.page ?? 1) >= data.totalPages}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }) })}
            className="clay-chip rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}

      {/* Always-on links into the NEET guides — crawlable from the main blog page. */}
      <nav aria-label="NEET chapter-wise weightage guides" className="mt-14 rounded-3xl bg-[#141b2b] p-6 text-white">
        <p className="font-display text-lg font-extrabold tracking-tight">NEET chapter-wise weightage, 2020–2026</p>
        <p className="mt-1 text-sm text-white/65">Which chapters and topics NEET actually asks from — ranked, paper by paper.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[
            ["All subjects", "/neet/chapter-wise-weightage"],
            ["Physics", "/neet/chapter-wise-weightage/physics"],
            ["Chemistry", "/neet/chapter-wise-weightage/chemistry"],
            ["Botany", "/neet/chapter-wise-weightage/botany"],
            ["Zoology", "/neet/chapter-wise-weightage/zoology"],
          ].map(([label, to]) => (
            <li key={to}>
              <Link to={to} className="inline-flex rounded-full border border-white/25 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <BlogCallbackSection examKey={search.examKey} category={search.category} className="mt-16" />
    </div>
    <SiteFooter />
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
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
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="clay group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      {post.coverImageUrl && (
        <div className="overflow-hidden">
          <img src={post.coverImageUrl} alt={post.coverImageAlt} className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{BLOG_CATEGORY_LABELS[post.category]}</span>
        <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-foreground">{post.title}</p>
        <p className="mt-1.5 line-clamp-2 flex-1 text-xs text-foreground/60">{post.excerpt}</p>
        <p className="mt-3 text-[11px] text-foreground/40">{post.readingTimeMinutes} min read</p>
      </div>
    </Link>
  );
}
