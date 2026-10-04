// src/routes/blog/$slug.tsx
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPublishedPostBySlug, incrementBlogViewCount, listRelatedPosts } from "@/server-functions/blog-public";
import { BlogBody, estimateReadingTimeMinutes, extractFaqItems, extractHeadings } from "@/lib/blog-content";
import { BLOG_CATEGORY_LABELS, resolveBlogPromoAudience } from "@/lib/blog-types";
import type { PublicBlogPostSummary } from "@/lib/blog-types";
import { MobileTableOfContents, TableOfContentsSidebar } from "@/components/blog/table-of-contents";
import { BlogBreadcrumbs, buildBreadcrumbJsonLd, buildPostBreadcrumbs } from "@/components/blog/blog-breadcrumbs";
import { FreeTestPopup } from "@/components/blog/free-test-popup";
import { BlogCallbackSection } from "@/components/blog/blog-callback-section";
import {
  IconClock as Clock,
  IconLink as LinkIcon,
  IconBrandWhatsapp as WhatsApp,
  IconArrowRight as ArrowRight,
  IconArrowLeft as ArrowLeft,
  IconCheck as Check,
} from "@tabler/icons-react";

const SITE_URL = "https://www.edurack.in";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const { post } = await getPublishedPostBySlug({ data: { slug: params.slug } });
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.post) {
      return { meta: [{ title: "Post not found · Edurack Blog" }] };
    }
    const { post } = loaderData;
    const url = `${SITE_URL}/blog/${post.slug}`;
    const isOrgByline = post.author.name.trim().toLowerCase() === "edurack" && !post.author.mentorId;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.seoDescription,
      image: post.coverImageUrl ?? undefined,
      datePublished: post.publishedAt ?? undefined,
      dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
      // A byline of "Edurack" (with no linked mentor) is the organization
      // itself, not a person — mark it up as such so search engines tie the
      // post to the Edurack brand entity.
      author: isOrgByline
        ? { "@type": "Organization", name: "Edurack", url: SITE_URL }
        : { "@type": "Person", name: post.author.name },
      publisher: { "@type": "Organization", name: "Edurack", url: SITE_URL },
      mainEntityOfPage: url,
    };
    const faqItems = extractFaqItems(post.bodyMarkdown);
    const faqJsonLd = faqItems.length
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;
    const breadcrumbJsonLd = buildBreadcrumbJsonLd(buildPostBreadcrumbs(post));
    return {
      meta: [
        { title: `${post.seoTitle} · Edurack Blog` },
        { name: "description", content: post.seoDescription },
        { property: "og:type", content: "article" },
        { property: "og:title", content: post.seoTitle },
        { property: "og:description", content: post.seoDescription },
        { property: "og:url", content: url },
        ...(post.coverImageUrl ? [{ property: "og:image", content: post.coverImageUrl }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd) },
        ...(faqJsonLd ? [{ type: "application/ld+json", children: JSON.stringify(faqJsonLd) }] : []),
      ],
    };
  },
  notFoundComponent: BlogPostNotFound,
  component: BlogPostPage,
});

function BlogPostNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-foreground">Post not found</h1>
      <p className="mt-2 text-sm text-foreground/60">This post doesn't exist, or isn't published.</p>
      <Link to="/blog" className="mt-6 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">
        Back to the blog
      </Link>
    </div>
  );
}

// Thin bar at the very top of the screen showing how far through the article
// the reader is. Pure transform updates on rAF — no re-renders while scrolling.
function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = document.getElementById(targetId);
      const bar = barRef.current;
      if (!el || !bar) return;
      const rect = el.getBoundingClientRect();
      const progress = (-rect.top + window.innerHeight * 0.35) / Math.max(rect.height, 1);
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [targetId]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 bg-transparent">
      <div ref={barRef} className="h-full origin-left bg-primary" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function BlogPostPage() {
  const { post } = Route.useLoaderData();
  const [related, setRelated] = useState<PublicBlogPostSummary[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    incrementBlogViewCount({ data: { slug: post.slug } }).catch(() => {});
    listRelatedPosts({ data: { postId: post.id, category: post.category, examKey: post.examKey } })
      .then((r) => setRelated(r.posts))
      .catch(() => {});
  }, [post.id]);

  const shareUrl = `${SITE_URL}/blog/${post.slug}`;
  const readingTime = post.readingTimeMinutes || estimateReadingTimeMinutes(post.bodyMarkdown);
  const headings = useMemo(() => extractHeadings(post.bodyMarkdown), [post.bodyMarkdown]);
  const breadcrumbs = useMemo(() => buildPostBreadcrumbs(post), [post]);
  const audience = resolveBlogPromoAudience({ examKey: post.examKey, category: post.category });

  const published = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:pt-12">
      <ReadingProgress targetId="post-body" />
      {/* key: a fresh 10s timer for every post, even when navigating post → post */}
      <FreeTestPopup key={post.id} audience={audience} />

      {/* Skip link: first focusable element on the page, visible only on keyboard focus. */}
      <a
        href="#post-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-background"
      >
        Skip to article content
      </a>

      <BlogBreadcrumbs crumbs={breadcrumbs} />

      <article id="post-content" tabIndex={-1} className="focus:outline-none">
        {/* ── Hero ── */}
        <header className="mt-6 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
            <span className="rounded-full bg-primary/10 px-3.5 py-1.5 text-primary">{BLOG_CATEGORY_LABELS[post.category]}</span>
            <span className="flex items-center gap-1.5 text-foreground/55">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {readingTime} min read
            </span>
          </div>

          <h1 className="mt-5 font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {post.title}
          </h1>

          {post.excerpt && <p className="mt-5 max-w-3xl text-lg leading-relaxed text-foreground/65 sm:text-xl">{post.excerpt}</p>}

          <div className="mt-6 flex items-center gap-3">
            {post.author.photoUrl ? (
              <img src={post.author.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-border" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden="true">
                {initials(post.author.name) || "E"}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">{post.author.name}</p>
              <p className="text-xs text-foreground/50">
                {published}
                {post.substantiveUpdate && post.updatedAt ? ` · Updated ${new Date(post.updatedAt).toLocaleDateString()}` : ""}
              </p>
            </div>
          </div>
        </header>

        {post.coverImageUrl && (
          <div className="mt-8 overflow-hidden rounded-3xl border border-border">
            <img src={post.coverImageUrl} alt={post.coverImageAlt} className="aspect-video w-full object-cover sm:aspect-[21/9]" />
          </div>
        )}

        {/* ── Body + sticky table of contents ── */}
        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start lg:gap-14">
          <div className="min-w-0 max-w-[46rem]">
            {/* Mobile-only: collapsed by default, sits inline in the reading flow. */}
            <MobileTableOfContents headings={headings} className="mb-8 lg:hidden" />

            <div id="post-body">
              <BlogBody markdown={post.bodyMarkdown} className="max-w-full" />
            </div>

            {/* End-of-article: share */}
            <div className="mt-12 flex flex-wrap items-center gap-2.5 border-t border-border pt-6">
              <span className="mr-1 text-xs font-bold uppercase tracking-wide text-foreground/45">Share</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="clay-chip flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-foreground/70 transition hover:border-foreground/40"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                <span aria-live="polite">{copied ? "Copied!" : "Copy link"}</span>
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${post.title} — ${shareUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="clay-chip flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-foreground/70 transition hover:border-foreground/40"
              >
                <WhatsApp className="h-3.5 w-3.5" aria-hidden="true" />
                WhatsApp
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>

            {(post.relatedBundleId || post.relatedBatchId) && (
              <div className="relative mt-8 overflow-hidden rounded-3xl bg-[#141b2b] p-6 text-white sm:p-8">
                <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#2864d7]/40 blur-2xl" />
                <p className="relative font-display text-xl font-extrabold tracking-tight">Ready to put this into practice?</p>
                <p className="relative mt-1.5 text-sm text-white/70">See the matching {post.relatedBundleId ? "test series" : "mentor batch"} on Edurack.</p>
                <Link
                  to="/course/$kind/$id"
                  params={{ kind: post.relatedBundleId ? "bundle" : "mentorship", id: (post.relatedBundleId ?? post.relatedBatchId)! }}
                  className="group relative mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#141b2b] transition hover:bg-white/90"
                >
                  View on Edurack
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>

          {/* Desktop-only sticky sidebar; the mobile disclosure above covers small screens. */}
          <TableOfContentsSidebar headings={headings} className="hidden lg:block" />
        </div>
      </article>

      {/* ── Related posts ── */}
      {related.length > 0 && (
        <nav aria-label="Related posts" className="mt-16 border-t border-border pt-10">
          <p className="mb-5 font-display text-xl font-extrabold tracking-tight text-foreground">Keep reading</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <Link
                key={r.id}
                to="/blog/$slug"
                params={{ slug: r.slug }}
                className="clay group overflow-hidden transition hover:-translate-y-0.5 hover:border-primary/40"
              >
                {r.coverImageUrl && (
                  <div className="overflow-hidden">
                    <img src={r.coverImageUrl} alt={r.coverImageAlt} className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" />
                  </div>
                )}
                <div className="p-3.5">
                  <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{r.title}</p>
                  <p className="mt-1.5 text-[11px] text-foreground/45">{r.readingTimeMinutes} min read</p>
                </div>
              </Link>
            ))}
          </div>
        </nav>
      )}

      <div className="mt-8">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All posts
        </Link>
      </div>

      {/* ── Very end of the page: request a call back ── */}
      <BlogCallbackSection examKey={post.examKey} category={post.category} postSlug={post.slug} className="mt-12" />
    </div>
  );
}