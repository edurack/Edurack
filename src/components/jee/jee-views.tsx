// src/components/jee/jee-views.tsx
//
// The public JEE Main weightage pages (hub → subject → chapter, plus most-repeated concepts).
// Server-rendered like the NEET blueprint pages: all text, tables and links are in the HTML
// Google reads. No client state, nothing hidden from crawlers.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  EARLIER_LABEL,
  JEE_RANGE,
  RECENT_LABEL,
  YEARS,
  conceptsForChapter,
  droppedChapters,
  getJeeChapter,
  getJeeSubject,
  getJeeSubjects,
  jeeActiveChapters,
  jeePracticeSearch,
  jeeTotalQuestions,
  neighbours,
  topJeeChaptersOverall,
  topJeeConceptsOverall,
  type JeeChapter,
  type JeeConcept,
  type JeeSubject,
} from "@/lib/jee-blueprint";
import { JEE_DATA_NOTE, jeeChapterFaq, jeeChapterSummary, jeeHubFaq, jeeHubIntro, jeeSubjectFaq, jeeSubjectIntro, jeeConceptsFaq, type Faq } from "@/lib/jee-blueprint-copy";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { RelatedGuides } from "@/components/jee/jee-related";

const fmt = (n: number) => n.toLocaleString("en-IN");

export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">{children}</main>
      <SiteFooter />
    </>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: ReactNode }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
      <Link to="/" className="hover:underline">Home</Link>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span aria-hidden>/</span>
          {it.to ?? <span className="font-semibold text-foreground/80">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{children}</h1>;
export const SectionTitle = ({ children }: { children: ReactNode }) => <h2 className="mb-3 mt-10 font-display text-xl font-bold tracking-tight text-foreground">{children}</h2>;

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="clay-inset rounded-2xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-foreground/50">{hint}</p>}
    </div>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="space-y-2">
      {faqs.map((f) => (
        <details key={f.q} className="clay-inset rounded-2xl px-4 py-3 open:pb-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">{f.q}</summary>
          <p className="mt-2 text-sm leading-relaxed text-foreground/70">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function YearBars({ years, caption }: { years: number[]; caption: string }) {
  const max = Math.max(1, ...years);
  return (
    <figure>
      <div className="flex h-32 items-end gap-2 sm:gap-3" role="img" aria-label={caption}>
        {years.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold text-foreground">{n}</span>
            <div className="w-full rounded-md bg-[#141b2b]" style={{ height: `${Math.max(n > 0 ? 6 : 2, (n / max) * 84)}px`, opacity: n > 0 ? 1 : 0.2 }} />
            <span className="text-[10px] text-foreground/50">{YEARS[i]}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-foreground/50">{caption}</figcaption>
    </figure>
  );
}

export function PracticeCta({ line, subject }: { line: string; subject?: string }) {
  return (
    <div className="ink-section mt-10 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display text-lg font-extrabold">{line}</p>
        <p className="mt-1 text-sm text-white/65">Solve JEE previous-year questions with solutions on Edurack.</p>
      </div>
      <Link to="/pyq" search={jeePracticeSearch(subject) as never} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#ffffff] px-6 text-sm font-extrabold text-[#141b2b]">
        Practise JEE PYQs
      </Link>
    </div>
  );
}

export function ChapterLink({ c, showSubject = false }: { c: JeeChapter; showSubject?: boolean }) {
  return (
    <Link to="/jee/chapter-wise-weightage/$subject/$chapter" params={{ subject: c.subjectKey, chapter: c.slug }} className="font-semibold text-foreground hover:underline">
      {c.name}
      {showSubject && <span className="font-normal text-foreground/50"> · {c.subjectShort}</span>}
    </Link>
  );
}

export function TrendBadge({ c }: { c: JeeChapter }) {
  if (c.retired) return <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground/60">Not in syllabus</span>;
  const label = c.trend === "rising" ? "↑ Rising" : c.trend === "falling" ? "↓ Falling" : "→ Steady";
  return <span className="text-xs font-semibold text-foreground/70">{label}</span>;
}

export function DataNote() {
  return <p className="mt-8 text-xs leading-relaxed text-foreground/50">{JEE_DATA_NOTE}</p>;
}

export function YearCells({ years }: { years: number[] }) {
  return (
    <>
      {years.map((n, i) => (
        <td key={i} className="px-1 py-2 text-center text-xs" style={n > 0 ? { backgroundColor: `rgba(20,27,43,${Math.min(0.08 + n * 0.006, 0.4)})` } : undefined}>
          <span className={n > 0 ? "font-bold text-foreground" : "text-foreground/25"}>{n > 0 ? n : "–"}</span>
        </td>
      ))}
    </>
  );
}

function ChapterTable({ chapters, showRank = true }: { chapters: JeeChapter[]; showRank?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl" role="region" aria-label="Chapter-wise question counts by year" tabIndex={0}>
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
            {showRank && <th scope="col" className="w-8 py-2 pr-2 font-semibold">#</th>}
            <th scope="col" className="py-2 pr-3 font-semibold">Chapter</th>
            {YEARS.map((y) => (
              <th key={y} scope="col" className="px-1 py-2 text-center font-semibold">{y}</th>
            ))}
            <th scope="col" className="px-2 py-2 text-center font-semibold">Total</th>
            <th scope="col" className="px-2 py-2 text-center font-semibold" title={`Share of the subject, ${RECENT_LABEL}`}>Share {RECENT_LABEL}</th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">Trend</th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((c) => (
            <tr key={c.slug} className="border-t border-foreground/10">
              {showRank && <td className="py-2 pr-2 text-xs text-foreground/40">{c.retired ? "–" : c.rank}</td>}
              <th scope="row" className="py-2 pr-3 text-[13px] font-medium leading-snug"><ChapterLink c={c} /></th>
              <YearCells years={c.years} />
              <td className="px-2 py-2 text-center text-xs font-bold text-foreground">{c.total}</td>
              <td className="px-2 py-2 text-center text-xs text-foreground/70">{c.recentShare}%</td>
              <td className="px-2 py-2 text-center"><TrendBadge c={c} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConceptTable({ concepts, showSubject = false }: { concepts: JeeConcept[]; showSubject?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl" role="region" aria-label="Concept-wise question counts by year" tabIndex={0}>
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
            <th scope="col" className="w-8 py-2 pr-2 font-semibold">#</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Concept</th>
            {YEARS.map((y) => (
              <th key={y} scope="col" className="px-1 py-2 text-center font-semibold">{y}</th>
            ))}
            <th scope="col" className="px-2 py-2 text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {concepts.map((k, i) => {
            const ch = k.chapterSlug ? getJeeChapter(k.subjectKey, k.chapterSlug) : undefined;
            return (
              <tr key={k.subjectKey + k.name} className="border-t border-foreground/10">
                <td className="py-2 pr-2 text-xs text-foreground/40">{i + 1}</td>
                <th scope="row" className="py-2 pr-3 text-[13px] font-medium leading-snug text-foreground">
                  {k.name}
                  {(showSubject || ch) && (
                    <span className="block text-xs font-normal text-foreground/50">
                      {showSubject && <>{k.subjectName}{ch ? " · " : ""}</>}
                      {ch && <ChapterLink c={ch} />}
                    </span>
                  )}
                </th>
                <YearCells years={k.years} />
                <td className="px-2 py-2 text-center text-xs font-bold text-foreground">{k.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── /jee/chapter-wise-weightage ─────────────────────────────────────────────
export function JeeHubView() {
  const subjects = getJeeSubjects();
  const top = topJeeChaptersOverall(15);
  const dropped = droppedChapters();
  return (
    <Page>
      <Crumbs items={[{ label: "JEE chapter-wise weightage" }]} />
      <H1>
        JEE Main chapter-wise weightage <span className="text-foreground/60">{JEE_RANGE}</span>
      </H1>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground/80">
        {jeeHubIntro().map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Questions counted" value={fmt(jeeTotalQuestions())} hint="across all shifts" />
        <Stat label="Chapters in syllabus" value={jeeActiveChapters()} hint="Physics, Chemistry, Maths" />
        <Stat label="Dropped chapters" value={dropped.length} hint="not in the 2026 syllabus" />
        <Stat label="Years" value="5" hint={JEE_RANGE} />
      </div>

      <SectionTitle>Pick a subject</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        {subjects.map((s) => (
          <div key={s.key} className="clay rounded-3xl p-5">
            <Link to="/jee/chapter-wise-weightage/$subject" params={{ subject: s.key }} className="font-display text-xl font-bold text-foreground hover:underline">
              JEE Main {s.name}
            </Link>
            <p className="mt-1 text-sm text-foreground/60">{fmt(s.total)} questions · {s.activeCount} chapters</p>
            <ol className="mt-3 space-y-1 text-sm text-foreground/80">
              {s.chapters.filter((c) => !c.retired).slice(0, 5).map((c) => (
                <li key={c.slug} className="flex items-baseline justify-between gap-2">
                  <ChapterLink c={c} />
                  <span className="shrink-0 text-xs text-foreground/50">{c.recentShare}%</span>
                </li>
              ))}
            </ol>
            <Link to="/jee/chapter-wise-weightage/$subject" params={{ subject: s.key }} className="mt-3 inline-block text-xs font-bold text-[var(--sky-deep)]">
              All {s.name} chapters →
            </Link>
          </div>
        ))}
      </div>

      <SectionTitle>Highest-weightage chapters across the whole paper</SectionTitle>
      <p className="mb-3 max-w-3xl text-sm text-foreground/70">
        Ranked by share of the full paper in {RECENT_LABEL}. Each subject carries equal marks, so a chapter's share of its subject is divided by three.
      </p>
      <ol className="clay space-y-2 rounded-3xl p-5 text-sm">
        {top.map((c, i) => (
          <li key={c.subjectKey + c.slug} className="flex items-baseline gap-3">
            <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
            <span className="flex-1"><ChapterLink c={c} showSubject /></span>
            <span className="shrink-0 text-xs font-bold text-foreground">{c.paperShare}% of paper</span>
          </li>
        ))}
      </ol>

      {dropped.length > 0 && (
        <>
          <SectionTitle>Chapters no longer in the JEE Main syllabus</SectionTitle>
          <p className="mb-3 max-w-3xl text-sm text-foreground/70">These appeared in earlier papers but are not listed in NTA's 2026 syllabus.</p>
          <ul className="clay grid gap-x-6 gap-y-1.5 rounded-3xl p-5 text-sm sm:grid-cols-2">
            {dropped.map((c) => (
              <li key={c.subjectKey + c.slug} className="flex items-baseline justify-between gap-2">
                <ChapterLink c={c} showSubject />
                <span className="shrink-0 text-xs text-foreground/50">{c.total} Qs</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8">
        <Link to="/jee/most-repeated-concepts" className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
          <p className="font-display text-lg font-bold text-foreground">Most repeated JEE Main concepts</p>
          <p className="mt-1 text-sm text-foreground/60">See the concepts JEE Main has asked the most, ranked by questions, with year-wise counts.</p>
        </Link>
      </div>

      <RelatedGuides exclude={["weightage", "concepts"]} />

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={jeeHubFaq()} />
      <PracticeCta line="Turn weightage into marks: solve JEE PYQs chapter by chapter." />
      <DataNote />
    </Page>
  );
}

// ── /jee/chapter-wise-weightage/<subject> ───────────────────────────────────
export function JeeSubjectView({ subjectKey }: { subjectKey: string }) {
  const s = getJeeSubject(subjectKey) as JeeSubject;
  const active = s.chapters.filter((c) => !c.retired);
  const dropped = s.chapters.filter((c) => c.retired);
  return (
    <Page>
      <Crumbs items={[{ label: "JEE chapter-wise weightage", to: <Link to="/jee/chapter-wise-weightage" className="hover:underline">JEE chapter-wise weightage</Link> }, { label: s.name }]} />
      <H1>
        JEE Main {s.name} chapter-wise weightage <span className="text-foreground/60">{JEE_RANGE}</span>
      </H1>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground/80">
        {jeeSubjectIntro(s).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Questions counted" value={fmt(s.total)} hint="across all shifts" />
        <Stat label="Chapters in syllabus" value={s.activeCount} />
        <Stat label="Highest chapter" value={active[0].name} hint={`${active[0].recentShare}% in ${RECENT_LABEL}`} />
      </div>

      <SectionTitle>{s.name} questions per year</SectionTitle>
      <div className="clay rounded-3xl p-5">
        <YearBars years={s.yearTotals} caption={`${s.name} questions counted per year, ${JEE_RANGE}. Years differ in number of shifts.`} />
      </div>

      <SectionTitle>{s.name} chapters ranked by weightage</SectionTitle>
      <div className="clay rounded-3xl p-5">
        <ChapterTable chapters={active} />
      </div>

      {dropped.length > 0 && (
        <>
          <SectionTitle>{s.name} chapters not in the 2026 syllabus</SectionTitle>
          <div className="clay rounded-3xl p-5">
            <ChapterTable chapters={dropped} showRank={false} />
          </div>
        </>
      )}

      {s.concepts.length > 0 && (
        <>
          <SectionTitle>Most repeated {s.name} concepts</SectionTitle>
          <div className="clay rounded-3xl p-5">
            <ConceptTable concepts={s.concepts.slice(0, 15)} />
          </div>
          <p className="mt-3 text-sm">
            <Link to="/jee/most-repeated-concepts" className="font-bold text-[var(--sky-deep)]">See concepts across all subjects →</Link>
          </p>
        </>
      )}

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={jeeSubjectFaq(s)} />
      <PracticeCta line={`Practise JEE Main ${s.name} PYQs`} subject={s.short} />
      <RelatedGuides exclude={["weightage"]} limit={6} />
      <DataNote />
    </Page>
  );
}

// ── /jee/chapter-wise-weightage/<subject>/<chapter> ─────────────────────────
export function JeeChapterView({ subjectKey, chapterSlug }: { subjectKey: string; chapterSlug: string }) {
  const s = getJeeSubject(subjectKey) as JeeSubject;
  const c = getJeeChapter(subjectKey, chapterSlug) as JeeChapter;
  const ks = conceptsForChapter(c);
  const { prev, next } = neighbours(c);
  return (
    <Page>
      <Crumbs
        items={[
          { label: "JEE chapter-wise weightage", to: <Link to="/jee/chapter-wise-weightage" className="hover:underline">JEE chapter-wise weightage</Link> },
          { label: s.name, to: <Link to="/jee/chapter-wise-weightage/$subject" params={{ subject: s.key }} className="hover:underline">{s.name}</Link> },
          { label: c.name },
        ]}
      />
      <H1>
        JEE Main {c.name} weightage <span className="text-foreground/60">{JEE_RANGE}</span>
      </H1>
      <p className="mt-2 text-sm text-foreground/55">{c.subjectName}{c.retired ? " · not in the JEE Main 2026 syllabus" : ""}</p>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground/80">
        {jeeChapterSummary(c, s).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Questions" value={c.total} hint={`${c.share}% of ${s.name}`} />
        <Stat label={`Share ${RECENT_LABEL}`} value={`${c.recentShare}%`} hint={`${EARLIER_LABEL}: ${c.earlierAvgShare}% avg`} />
        <Stat label="Rank in subject" value={c.retired ? "–" : `#${c.rank}`} hint={c.retired ? "not in syllabus" : `of ${s.activeCount} chapters`} />
        <Stat label="Years asked" value={`${c.yearsAsked} of 5`} />
      </div>

      <SectionTitle>Questions per year</SectionTitle>
      <div className="clay rounded-3xl p-5">
        <YearBars years={c.years} caption={`${c.name} questions counted per year, ${JEE_RANGE}. Years differ in number of shifts, so compare shares, not raw counts.`} />
        <p className="mt-3 text-xs text-foreground/55">Share of the {s.name} paper by year: {c.yearShares.map((v, i) => `${YEARS[i]} ${v}%`).join(" · ")}</p>
      </div>

      {!c.retired && c.syllabus && (
        <>
          <SectionTitle>What the JEE Main syllabus covers</SectionTitle>
          <p className="clay rounded-3xl p-5 text-sm leading-relaxed text-foreground/80">{c.syllabus}</p>
        </>
      )}

      {ks.length > 0 && (
        <>
          <SectionTitle>Most repeated concepts in {c.name}</SectionTitle>
          <div className="clay rounded-3xl p-5">
            <ConceptTable concepts={ks} />
          </div>
        </>
      )}

      {(prev || next) && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {prev && (
            <Link to="/jee/chapter-wise-weightage/$subject/$chapter" params={{ subject: prev.subjectKey, chapter: prev.slug }} className="clay block rounded-2xl p-4 transition hover:-translate-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">Higher weightage</p>
              <p className="mt-0.5 font-semibold text-foreground">{prev.name}</p>
            </Link>
          )}
          {next && (
            <Link to="/jee/chapter-wise-weightage/$subject/$chapter" params={{ subject: next.subjectKey, chapter: next.slug }} className="clay block rounded-2xl p-4 transition hover:-translate-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">Next in ranking</p>
              <p className="mt-0.5 font-semibold text-foreground">{next.name}</p>
            </Link>
          )}
        </div>
      )}

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={jeeChapterFaq(c, s)} />
      <PracticeCta line={`Practise JEE Main ${s.name} PYQs`} subject={s.short} />
      <RelatedGuides exclude={["weightage", "concepts"]} limit={4} />
      <DataNote />
    </Page>
  );
}

// ── /jee/most-repeated-concepts ─────────────────────────────────────────────
export function JeeConceptsView() {
  const subjects = getJeeSubjects();
  const overall = topJeeConceptsOverall(20);
  return (
    <Page>
      <Crumbs items={[{ label: "Most repeated concepts" }]} />
      <H1>
        Most repeated concepts in JEE Main <span className="text-foreground/60">{JEE_RANGE}</span>
      </H1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
        The concepts JEE Main asked most often between 2022 and 2026, counted across all shifts. Pick a subject below, or start with the overall top 20. Each concept links to its chapter where the chapter page exists.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        {subjects.map((s) => (
          <a key={s.key} href={`#${s.key}`} className="clay-inset rounded-full px-4 py-1.5 font-semibold text-foreground">
            {s.name}
          </a>
        ))}
      </div>

      <SectionTitle>Top 20 across Physics, Chemistry and Maths</SectionTitle>
      <div className="clay rounded-3xl p-5">
        <ConceptTable concepts={overall} showSubject />
      </div>

      {subjects.map((s) => (
        <section key={s.key} id={s.key}>
          <SectionTitle>{s.name} concepts</SectionTitle>
          <div className="clay rounded-3xl p-5">
            <ConceptTable concepts={s.concepts} />
          </div>
          <p className="mt-3 text-sm">
            <Link to="/jee/chapter-wise-weightage/$subject" params={{ subject: s.key }} className="font-bold text-[var(--sky-deep)]">{s.name} chapter-wise weightage →</Link>
          </p>
        </section>
      ))}

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={jeeConceptsFaq()} />
      <PracticeCta line="Solve JEE PYQs on the concepts that repeat." />
      <RelatedGuides exclude={["concepts"]} />
      <DataNote />
    </Page>
  );
}

export function JeeNotFound() {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-foreground/60">That subject or chapter isn't in the JEE Main weightage guide.</p>
        <Link to="/jee/chapter-wise-weightage" className="clay-btn mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white">
          See all JEE chapters
        </Link>
      </div>
      <SiteFooter />
    </>
  );
}
