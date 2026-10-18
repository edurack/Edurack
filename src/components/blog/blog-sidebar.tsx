// src/components/blog/blog-sidebar.tsx
//
// Right-hand rail of a blog post. Built from data fetched in the route loader,
// so every link below is in the server-rendered HTML: a crawler reading one
// post also finds the NEET guides, the most-read and latest posts and every
// category — and a reader always has a next place to go.
import { Link } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight, IconFlame as Flame, IconClock as Clock, IconCompass as Compass, IconTargetArrow as Target } from "@tabler/icons-react";
import { TableOfContentsSidebar } from "@/components/blog/table-of-contents";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog-types";
import type { BlogCategory, PublicBlogPost, PublicBlogPostSummary, SidebarChapter, SidebarTopic } from "@/lib/blog-types";
import type { BlogHeading } from "@/lib/blog-content";

export type BlogSidebarData = {
  related: PublicBlogPostSummary[];
  latest: PublicBlogPostSummary[];
  popular: PublicBlogPostSummary[];
  categories: { category: BlogCategory; count: number }[];
  /** NEET chapter pages this post is about (empty for non-NEET posts). */
  chapters: SidebarChapter[];
  /** Most repeated NEET topics; each links to its chapter page. */
  topics: SidebarTopic[];
};

export const EMPTY_SIDEBAR: BlogSidebarData = { related: [], latest: [], popular: [], categories: [], chapters: [], topics: [] };

const NEET_GUIDES = [
  { label: "All chapters ranked", to: "/neet/chapter-wise-weightage" },
  { label: "NEET Physics weightage", to: "/neet/chapter-wise-weightage/physics" },
  { label: "NEET Chemistry weightage", to: "/neet/chapter-wise-weightage/chemistry" },
  { label: "NEET Botany weightage", to: "/neet/chapter-wise-weightage/botany" },
  { label: "NEET Zoology weightage", to: "/neet/chapter-wise-weightage/zoology" },
] as const;

function Card({ title, icon, children, id }: { title: string; icon?: React.ReactNode; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="clay p-4">
      <h2 id={id} className="mb-3 flex items-center gap-2 font-display text-sm font-extrabold tracking-tight text-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function PostRow({ p, rank }: { p: PublicBlogPostSummary; rank?: number }) {
  return (
    <li>
      <Link to="/blog/$slug" params={{ slug: p.slug }} className="group flex gap-3 rounded-xl p-1.5 transition-colors hover:bg-foreground/5">
        {rank ? (
          <span className="mt-0.5 w-5 shrink-0 text-center font-display text-lg font-extrabold text-foreground/25">{rank}</span>
        ) : p.coverImageUrl ? (
          <img src={p.coverImageUrl} alt="" loading="lazy" className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover" />
        ) : null}
        <span className="min-w-0">
          <span className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground group-hover:underline">{p.title}</span>
          <span className="mt-0.5 block text-[11px] text-foreground/45">
            {BLOG_CATEGORY_LABELS[p.category]} · {p.readingTimeMinutes} min read
          </span>
        </span>
      </Link>
    </li>
  );
}

export function BlogSidebar({ post, headings, data }: { post: PublicBlogPost; headings: BlogHeading[]; data: BlogSidebarData }) {
  const neetRelevant =
    post.examKey === "neet" || post.category === "neetStrategy" || (!post.examKey && !["jeeStrategy", "cuetStrategy", "ipmatStrategy"].includes(post.category));

  return (
    <aside
      aria-label="More from Edurack"
      className="mt-12 space-y-5 lg:mt-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1"
    >
      <TableOfContentsSidebar headings={headings} sticky={false} className="hidden lg:block" />

      {neetRelevant ? (
        <section aria-labelledby="sb-neet" className="relative overflow-hidden rounded-3xl bg-[#141b2b] p-5 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#2864d7]/40 blur-2xl" />
          <h2 id="sb-neet" className="relative flex items-center gap-2 font-display text-base font-extrabold tracking-tight">
            <Target className="h-4 w-4" aria-hidden="true" /> NEET chapter-wise weightage
          </h2>
          <p className="relative mt-1 text-xs leading-relaxed text-white/65">See which chapters and topics NEET asked from, paper by paper, 2020–2026.</p>
          <ul className="relative mt-3 space-y-0.5">
            {NEET_GUIDES.map((g) => (
              <li key={g.to}>
                <Link to={g.to} className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] font-semibold text-white/90 transition hover:bg-white/10">
                  {g.label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/pyq" search={{ exam: "neet" }} className="relative mt-3 inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#141b2b] transition hover:bg-white/90">
            Practise NEET PYQs
          </Link>
        </section>
      ) : (
        <section aria-labelledby="sb-practice" className="relative overflow-hidden rounded-3xl bg-[#141b2b] p-5 text-white">
          <h2 id="sb-practice" className="font-display text-base font-extrabold tracking-tight">Practise in the real exam format</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/65">Try the CBT simulator and see how a full test feels.</p>
          <Link to="/simulator/live" className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#141b2b] transition hover:bg-white/90">
            Open the CBT simulator
          </Link>
        </section>
      )}

      {data.chapters.length > 0 && (
        <Card id="sb-chapters" title="NEET chapters in this post" icon={<Target className="h-4 w-4 text-primary" aria-hidden="true" />}>
          <ul className="space-y-1">
            {data.chapters.map((c) => (
              <li key={`${c.subjectKey}/${c.slug}`}>
                <Link
                  to="/neet/chapter-wise-weightage/$subject/$chapter"
                  params={{ subject: c.subjectKey, chapter: c.slug }}
                  className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-[13px] font-bold text-foreground hover:bg-foreground/5"
                >
                  <span className="min-w-0">
                    <span className="block group-hover:underline">{c.name}</span>
                    <span className="block text-[11px] font-medium text-foreground/45">{c.subjectName} weightage and PYQs</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.topics.length > 0 && (
        <Card id="sb-repeated" title="Most repeated NEET topics" icon={<Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />}>
          <ul className="space-y-1">
            {data.topics.map((t) => (
              <li key={`${t.subjectKey}/${t.slug}/${t.name}`}>
                <Link
                  to="/neet/chapter-wise-weightage/$subject/$chapter"
                  params={{ subject: t.subjectKey, chapter: t.slug }}
                  className="group block rounded-lg px-1.5 py-1.5 hover:bg-foreground/5"
                >
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground group-hover:underline">{t.name}</span>
                  <span className="block text-[11px] text-foreground/45">
                    {t.chapterName} · in {t.papers} of 8 papers
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/neet/most-repeated-topics" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            See all most repeated topics <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>
      )}

      {data.popular.length > 0 && (
        <Card id="sb-popular" title="Most read" icon={<Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />}>
          <ol className="space-y-1">
            {data.popular.map((p, i) => (
              <PostRow key={p.id} p={p} rank={i + 1} />
            ))}
          </ol>
        </Card>
      )}

      {data.latest.length > 0 && (
        <Card id="sb-latest" title="Latest posts" icon={<Clock className="h-4 w-4 text-primary" aria-hidden="true" />}>
          <ul className="space-y-1">
            {data.latest.map((p) => (
              <PostRow key={p.id} p={p} />
            ))}
          </ul>
        </Card>
      )}

      {data.categories.length > 0 && (
        <Card id="sb-topics" title="Browse by topic" icon={<Compass className="h-4 w-4 text-foreground/50" aria-hidden="true" />}>
          <ul className="flex flex-wrap gap-2">
            {data.categories.map((c) => (
              <li key={c.category}>
                <Link to="/blog" search={{ category: c.category }} className="clay-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/75 transition hover:border-foreground/40">
                  {BLOG_CATEGORY_LABELS[c.category]}
                  <span className="text-foreground/40">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/blog" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            See all posts <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>
      )}

      <section aria-labelledby="sb-help" className="clay p-4">
        <h2 id="sb-help" className="font-display text-sm font-extrabold tracking-tight text-foreground">Need guidance?</h2>
        <p className="mt-1 text-xs leading-relaxed text-foreground/60">Talk to the Edurack team about mentors, batches and test series.</p>
        <Link to="/contact" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
          Contact us <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </section>
    </aside>
  );
}
