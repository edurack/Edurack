// src/components/jee/jee-landing-view.tsx
//
// JEE Main 2027 landing page (/jee-main-2027). A discovery layer over systems that already exist: the blog,
// the PDF resource library and the PYQ practice flow. It owns no content, uploads nothing and starts no
// practice. Every dynamic block comes from the route loader (server-rendered, so crawlers see it) and is
// hidden when it has nothing real to show — no placeholders, no invented counts.
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { IconArrowRight as ArrowRight, IconClock as Clock, IconDownload as Download, IconFileText as FileText, IconTargetArrow as Target } from "@tabler/icons-react";
import { Crumbs, Page } from "@/components/jee/jee-views";
import { track, trackOnce } from "@/lib/analytics";
import { getJeeSubjects, jeePracticeSearch } from "@/lib/jee-blueprint";
import { JEE_LANDING_FAQS } from "@/lib/jee-landing-copy";
import type { JeeLandingData } from "@/lib/jee-landing-types";
import { JEE_LIBRARY_YEAR, JEE_LIB_BASE, JEE_RESOURCE_TYPE_LABELS, jeeLibChapterPath, jeeLibSubjectPath } from "@/lib/jee-resource-types";
import { BLOG_CATEGORY_LABELS, type PublicBlogPostSummary } from "@/lib/blog-types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// Fixed time zone so the server-rendered date and the browser's agree (no hydration mismatch).
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="mb-3 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{children}</h2>
);
const Section = ({ id, className = "mt-12", children }: { id: string; className?: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className={className}>{children}</section>
);
const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-extrabold transition";

// ── Articles ─────────────────────────────────────────────────────────────────
function articleDate(p: PublicBlogPostSummary) {
  // The "Updated" date is shown only when the editor marked the edit as substantive — same rule as the blog itself.
  if (p.substantiveUpdate && p.updatedAt) return { label: "Updated", iso: p.updatedAt };
  const iso = p.publishedAt ?? p.updatedAt;
  return iso ? { label: "Published", iso } : null;
}

function ArticleCard({ post, source, position, cover }: { post: PublicBlogPostSummary; source: "updates" | "guides"; position: number; cover?: boolean }) {
  const when = articleDate(post);
  return (
    <li className="min-w-0">
      <Link
        to="/blog/$slug"
        params={{ slug: post.slug }}
        onClick={() => track("jee_2027_blog_clicked", { source, slug: post.slug, post_id: post.id, category: post.category, position })}
        className="clay group flex h-full flex-col overflow-hidden rounded-3xl transition hover:-translate-y-0.5"
      >
        {cover && post.coverImageUrl && (
          <img src={post.coverImageUrl} alt={post.coverImageAlt || ""} width={640} height={360} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
        )}
        <span className="flex flex-1 flex-col p-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sky-deep)]">{BLOG_CATEGORY_LABELS[post.category]}</span>
          <span className="mt-1.5 break-words font-display text-base font-bold leading-snug text-foreground group-hover:underline">{post.title}</span>
          {post.excerpt && <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground/65">{post.excerpt}</span>}
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-foreground/50">
            {when && <time dateTime={when.iso}>{when.label} {dateLabel(when.iso)}</time>}
            {cover && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {post.readingTimeMinutes} min read
              </span>
            )}
          </span>
          <span className="mt-3 text-sm font-bold text-[var(--sky-deep)]">Read article →</span>
        </span>
      </Link>
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function JeeLandingView({ data }: { data: JeeLandingData }) {
  const { summary, featured, blog, pyqTotal } = data;
  const subjects = getJeeSubjects();

  // One landing-view event per page load: the key makes re-renders and React's dev double-mount harmless.
  // A view is NOT a practice start — practice events come only from the CTA clicks below.
  useEffect(() => {
    trackOnce("jee2027-landing-view", "jee_2027_landing_viewed", {
      resources_published: summary.total,
      articles_published: blog.total,
      pyq_available: pyqTotal > 0,
    });
  }, [summary.total, blog.total, pyqTotal]);

  const resourceClick = (source: string, extra: Record<string, string | number> = {}) => () => track("jee_2027_resource_cta_clicked", { source, ...extra });
  const practiceClick = (source: string, extra: Record<string, string | number> = {}) => () => track("jee_2027_practice_cta_clicked", { source, ...extra });
  const hasArticles = blog.total > 0;

  return (
    <Page>
      <Crumbs items={[{ label: `JEE Main ${JEE_LIBRARY_YEAR}` }]} />

      {/* ── Hero: compact, no decorative art, primary CTA above the fold on a phone ── */}
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/55">Edurack / JEE Main {JEE_LIBRARY_YEAR}</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">Your JEE Main 2027 Preparation Starts Here.</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/80 sm:text-base">
          Prepare with exam updates, chapter-wise revision notes, downloadable practice sheets and previous-year questions—all in one place.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to={JEE_LIB_BASE as never} onClick={resourceClick("hero")} className={`${BTN} bg-foreground text-background hover:opacity-90`}>
            Explore Free Study Resources
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to="/pyq" search={jeePracticeSearch() as never} onClick={practiceClick("hero")} className={`${BTN} clay`}>
            Practise JEE PYQs
          </Link>
        </div>
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="What you get">
          {[
            { icon: FileText, label: "Chapter Notes" },
            { icon: Download, label: "Practice Sheets" },
            { icon: Target, label: "PYQ Practice" },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="clay-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/75">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </header>

      {/* ── Latest updates (Exam News category) ── */}
      {hasArticles && (
        <Section id="jee-updates">
          <H2 id="jee-updates">Latest JEE Main {JEE_LIBRARY_YEAR} Updates</H2>
          {blog.updates.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {blog.updates.map((p, i) => (
                <ArticleCard key={p.id} post={p} source="updates" position={i + 1} />
              ))}
            </ul>
          ) : (
            <p className="clay rounded-2xl p-4 text-sm text-foreground/70">No exam-update articles have been published yet. The preparation guides below are available now.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-foreground/55">
            These articles summarise public information. Always confirm exam dates, eligibility and syllabus against the official NTA notices.
          </p>
          <Link to="/blog" search={{ examKey: "jee" } as never} className="mt-2 inline-block text-sm font-bold text-[var(--sky-deep)] hover:underline">
            View all JEE articles →
          </Link>
        </Section>
      )}

      {/* ── Subjects ── */}
      <Section id="jee-subjects">
        <H2 id="jee-subjects">Choose Your Subject</H2>
        <div className="grid gap-4 sm:grid-cols-3">
          {subjects.map((s) => {
            const n = summary.bySubject[s.key] ?? 0;
            const chapters = s.chapters.filter((c) => !c.retired && summary.byChapter[`${s.key}/${c.slug}`]).length;
            return (
              <div key={s.key} className="clay flex flex-col rounded-3xl p-5">
                <span className="font-display text-xl font-bold text-foreground">{s.name}</span>
                <span className="mt-1 text-sm text-foreground/60">{n ? `${plural(n, "resource")} · ${plural(chapters, "chapter")}` : "Resources coming soon"}</span>
                {n > 0 && (
                  <Link
                    to={jeeLibSubjectPath(s.key) as never}
                    onClick={() => track("jee_2027_subject_clicked", { source: "subjects", subject: s.key, resources: n })}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[var(--sky-deep)] hover:underline"
                  >
                    Browse {s.name} →
                  </Link>
                )}
                <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs font-semibold text-foreground/60">
                  <Link to={`/jee/chapter-wise-weightage/${s.key}` as never} className="py-1 hover:underline">Weightage</Link>
                  <Link to={`/jee/syllabus/${s.key}` as never} className="py-1 hover:underline">Syllabus</Link>
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Featured chapters: only chapters with genuinely published resources ── */}
      {featured.length > 0 && (
        <Section id="jee-featured">
          <H2 id="jee-featured">Featured Chapter Resources</H2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c) => (
              <li key={`${c.subjectKey}/${c.chapterSlug}`} className="min-w-0">
                <Link
                  to={jeeLibChapterPath(c.subjectKey, c.chapterSlug) as never}
                  onClick={() => track("jee_2027_chapter_clicked", { source: "featured", subject: c.subjectKey, chapter: c.chapterSlug, resource_types: c.types.join(",") })}
                  className="clay flex h-full flex-col rounded-3xl p-5 transition hover:-translate-y-0.5"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/50">{c.subjectName}</span>
                  <span className="mt-1 break-words font-display text-base font-bold leading-snug text-foreground">{c.chapterName}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {c.types.map((t) => (
                      <span key={t} className="clay-chip rounded-full px-2.5 py-1 text-[11px] font-semibold text-foreground/70">{JEE_RESOURCE_TYPE_LABELS[t]}</span>
                    ))}
                  </span>
                  <span className="mt-auto pt-4 text-sm font-bold text-[var(--sky-deep)]">Open Chapter →</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to={JEE_LIB_BASE as never} onClick={resourceClick("featured")} className="mt-3 inline-block text-sm font-bold text-[var(--sky-deep)] hover:underline">
            Browse the full resource library →
          </Link>
        </Section>
      )}

      {/* ── PYQ conversion ── */}
      <section aria-labelledby="jee-pyq" className="ink-section mt-12 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 id="jee-pyq" className="font-display text-xl font-extrabold sm:text-2xl">Finished Revising? Test What You Remember.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
            Practise available JEE previous-year questions, review solutions and track your preparation with Edurack.
            {pyqTotal > 0 && ` ${pyqTotal.toLocaleString("en-IN")} JEE questions are available right now; coverage varies by subject and chapter.`}
          </p>
        </div>
        <Link to="/pyq" search={jeePracticeSearch() as never} onClick={practiceClick("pyq-section")} className={`${BTN} shrink-0 bg-[#ffffff] text-[#141b2b]`}>
          Start JEE PYQ Practice
        </Link>
      </section>

      {/* ── Preparation guides (never repeats the updates above) ── */}
      {blog.guides.length > 0 && (
        <Section id="jee-guides">
          <H2 id="jee-guides">JEE Main {JEE_LIBRARY_YEAR} Preparation Guides</H2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {blog.guides.map((p, i) => (
              <ArticleCard key={p.id} post={p} source="guides" position={i + 1} cover />
            ))}
          </ul>
          <Link to="/blog" search={{ examKey: "jee" } as never} className="mt-3 inline-block text-sm font-bold text-[var(--sky-deep)] hover:underline">
            View All Guides →
          </Link>
        </Section>
      )}

      {/* ── How to prepare ── */}
      <Section id="jee-how">
        <H2 id="jee-how">How to Prepare with Edurack</H2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: 1, t: "READ", d: "Open your chapter notes.", to: JEE_LIB_BASE, kind: "resource" },
            { n: 2, t: "REVISE", d: "Download quick revision PDFs.", to: JEE_LIB_BASE, kind: "resource" },
            { n: 3, t: "PRACTISE", d: "Complete available chapter worksheets.", to: JEE_LIB_BASE, kind: "resource" },
            { n: 4, t: "IMPROVE", d: "Check solutions and attempt available PYQs.", to: "/pyq", kind: "practice" },
          ].map((s) => (
            <li key={s.n} className="clay rounded-2xl p-4">
              <span className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-xs font-extrabold text-background" aria-hidden="true">{s.n}</span>
                <span className="font-display text-sm font-extrabold tracking-wide text-foreground">{s.t}</span>
              </span>
              <span className="mt-2 block text-sm text-foreground/70">{s.d}</span>
              {s.kind === "practice" ? (
                <Link to="/pyq" search={jeePracticeSearch() as never} onClick={practiceClick("how-to-prepare")} className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-[var(--sky-deep)] hover:underline">Open JEE PYQs →</Link>
              ) : (
                <Link to={s.to as never} onClick={resourceClick("how-to-prepare", { step: s.t.toLowerCase() })} className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-[var(--sky-deep)] hover:underline">Open the library →</Link>
              )}
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Planning guides (existing pages) ── */}
      <Section id="jee-plan">
        <H2 id="jee-plan">Know What to Study First</H2>
        <ul className="flex flex-wrap gap-2">
          {[
            { label: "JEE Main syllabus", to: "/jee/syllabus" },
            { label: "Chapter-wise weightage", to: "/jee/chapter-wise-weightage" },
            { label: "High-weightage chapters", to: "/jee/high-weightage-chapters" },
            { label: "Paper analysis", to: "/jee/paper-analysis" },
            { label: "Most repeated concepts", to: "/jee/most-repeated-concepts" },
          ].map((l) => (
            <li key={l.to}>
              <Link to={l.to as never} className="clay-chip inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-foreground/80 hover:underline">{l.label}</Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── FAQ: plain <details>, so every answer is in the server-rendered HTML ── */}
      <Section id="jee-faq">
        <H2 id="jee-faq">JEE Main {JEE_LIBRARY_YEAR} FAQs</H2>
        <div className="space-y-2">
          {JEE_LANDING_FAQS.map((f) => (
            <details key={f.q} className="clay group rounded-2xl p-4">
              <summary className="cursor-pointer list-none font-display text-[15px] font-bold text-foreground marker:content-none">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </Page>
  );
}
