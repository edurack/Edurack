// src/routes/blog/$slug.tsx
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPublishedPostBySlug, incrementBlogViewCount, listRelatedPosts } from "@/server-functions/blog-public";
import { BlogBody, estimateReadingTimeMinutes } from "@/lib/blog-content";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog-types";
import type { PublicBlogPostSummary } from "@/lib/blog-types";
import { IconClock as Clock, IconLink as LinkIcon, IconBrandWhatsapp as WhatsApp } from "@tabler/icons-react";

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
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.seoDescription,
      image: post.coverImageUrl ?? undefined,
      datePublished: post.publishedAt ?? undefined,
      dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
      author: { "@type": "Person", name: post.author.name },
      publisher: { "@type": "Organization", name: "Edurack" },
      mainEntityOfPage: url,
    };
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
      scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
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

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-14 break-words [overflow-wrap:anywhere]">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground/50">
        <span className="clay-chip rounded-full px-3 py-1">{BLOG_CATEGORY_LABELS[post.category]}</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {readingTime} min read
        </span>
      </div>

      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-4xl">{post.title}</h1>

      <div className="mt-4 flex items-center gap-3">
        {post.author.photoUrl && <img src={post.author.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />}
        <div>
          <p className="text-sm font-semibold text-foreground">{post.author.name}</p>
          <p className="text-xs text-foreground/50">
            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : ""}
            {post.substantiveUpdate && post.updatedAt ? ` · Updated ${new Date(post.updatedAt).toLocaleDateString()}` : ""}
          </p>
        </div>
      </div>

      {post.coverImageUrl && (
        <img src={post.coverImageUrl} alt={post.coverImageAlt} className="mt-6 aspect-video w-full rounded-2xl object-cover" />
      )}

      <BlogBody markdown={post.bodyMarkdown} className="mt-8 max-w-full overflow-hidden" />

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-5">
        <button
          onClick={() => {
            navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="clay-chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/60"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${post.title} —${shareUrl}`)}`}
          target="_blank"
          rel="noreferrer"
          className="clay-chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/60"
        >
          <WhatsApp className="h-3.5 w-3.5" />
          Share
        </a>
      </div>

      {(post.relatedBundleId || post.relatedBatchId) && (
        <div className="clay mt-8 p-5 text-center">
          <p className="text-sm font-semibold text-foreground">Ready to put this into practice?</p>
          <Link
            to="/course/$kind/$id"
            params={{ kind: post.relatedBundleId ? "bundle" : "mentorship", id: (post.relatedBundleId ?? post.relatedBatchId)! }}
            className="mt-3 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
          >
            View on Edurack
          </Link>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-14 border-t border-foreground/10 pt-8">
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-foreground/50">Related posts</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {related.map((r) => (
              <Link key={r.id} to="/blog/$slug" params={{ slug: r.slug }} className="clay overflow-hidden">
                {r.coverImageUrl && <img src={r.coverImageUrl} alt={r.coverImageAlt} className="h-32 w-full object-cover" />}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{r.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}