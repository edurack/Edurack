// src/components/neet/blueprint-views.tsx
//
// The three public pages of the NEET PYQ Blueprint (hub → subject → chapter).
// Server-rendered like the rest of the public site: all text, tables and links
// are in the HTML Google reads. No client state, nothing hidden from crawlers.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  PAPER_LABELS,
  PAPER_SHORT,
  RANGE_LABEL,
  chapterInsights,
  easiestChapters,
  getChapter,
  getSubject,
  getSubjects,
  mostRepeatedTopics,
  practiceSearch,
  topChaptersOverall,
  topicLabel,
  totalChapters,
  totalQuestions,
  type Chapter,
  type Subject,
  type Topic,
} from "@/lib/neet-blueprint";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import type { PyqRelated } from "@/lib/pyq-public";
import { GENERAL_TOPIC } from "@/lib/pyq-types";
import { DATA_NOTE, chapterFaq, chapterSummary, hubFaq, subjectFaq, subjectIntro, subjectYearTotals, type Faq } from "@/lib/neet-blueprint-copy";

// Shared page frame: the site header (with links to the blog, PYQ practice and
// these guides) and footer, so no page here is a dead end.
function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">{children}</main>
      <SiteFooter />
    </>
  );
}

// ── Small building blocks ──────────────────────────────────────────────────
function Crumbs({ items }: { items: { label: string; to?: ReactNode }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>/</span>}
          {it.to ?? <span className="font-semibold text-foreground/80">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="clay-inset rounded-2xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-foreground/50">{hint}</p>}
    </div>
  );
}

function DifficultyBar({ easy, med, hard }: { easy: number; med: number; hard: number }) {
  const t = Math.max(1, easy + med + hard);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`${easy} easy, ${med} medium, ${hard} hard`}>
        <div className="bg-[#141b2b]" style={{ width: `${(easy / t) * 100}%` }} />
        <div className="bg-[#6b7385]" style={{ width: `${(med / t) * 100}%` }} />
        <div className="bg-[#a9b0bd]" style={{ width: `${(hard / t) * 100}%` }} />
      </div>
    </div>
  );
}

function DifficultyLegend({ easy, med, hard }: { easy: number; med: number; hard: number }) {
  return (
    <p className="mt-1.5 text-xs text-foreground/60">
      <strong className="text-foreground">{easy}</strong> easy · <strong className="text-foreground">{med}</strong> medium · <strong className="text-foreground">{hard}</strong> hard
    </p>
  );
}

function PaperBars({ years, caption }: { years: number[]; caption: string }) {
  const max = Math.max(1, ...years);
  return (
    <figure>
      <div className="flex h-32 items-end gap-2 sm:gap-3" role="img" aria-label={caption}>
        {years.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold text-foreground">{n}</span>
            <div className="w-full rounded-md bg-[#141b2b]" style={{ height: `${Math.max(n > 0 ? 6 : 2, (n / max) * 84)}px`, opacity: n > 0 ? 1 : 0.2 }} />
            <span className="text-[10px] text-foreground/50" title={PAPER_LABELS[i]}>
              {PAPER_SHORT[i]}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-foreground/50">{caption}</figcaption>
    </figure>
  );
}

function FaqList({ faqs }: { faqs: Faq[] }) {
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

function TopicTable({ topics }: { topics: Topic[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl" role="region" aria-label="Topic-wise question counts by paper" tabIndex={0}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Topic
            </th>
            {PAPER_SHORT.map((p, i) => (
              <th key={p} scope="col" className="px-1 py-2 text-center font-semibold" title={PAPER_LABELS[i]}>
                {p}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              Total
            </th>
            <th scope="col" className="px-1 py-2 text-center font-semibold">
              E
            </th>
            <th scope="col" className="px-1 py-2 text-center font-semibold">
              M
            </th>
            <th scope="col" className="px-1 py-2 text-center font-semibold">
              H
            </th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.name} className="border-t border-foreground/10">
              <th scope="row" className="py-2 pr-3 text-[13px] font-medium leading-snug text-foreground">
                {t.name}
              </th>
              {t.years.map((n, i) => (
                <td key={i} className="px-1 py-2 text-center text-xs" style={n > 0 ? { backgroundColor: `rgba(20,27,43,${Math.min(0.1 + n * 0.12, 0.45)})` } : undefined}>
                  <span className={n > 0 ? "font-bold text-foreground" : "text-foreground/25"}>{n > 0 ? n : "–"}</span>
                </td>
              ))}
              <td className="px-2 py-2 text-center text-xs font-bold text-foreground">{t.total}</td>
              <td className="px-1 py-2 text-center text-xs text-foreground/60">{t.easy || "–"}</td>
              <td className="px-1 py-2 text-center text-xs text-foreground/60">{t.med || "–"}</td>
              <td className="px-1 py-2 text-center text-xs text-foreground/60">{t.hard || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChapterLink({ c, showSubject = false }: { c: Chapter; showSubject?: boolean }) {
  return (
    <Link to="/neet/chapter-wise-weightage/$subject/$chapter" params={{ subject: c.subjectKey, chapter: c.slug }} className="font-semibold text-foreground hover:underline">
      {c.name}
      {showSubject && <span className="font-normal text-foreground/50"> · {c.subjectName}</span>}
    </Link>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-10 font-display text-xl font-bold tracking-tight text-foreground">{children}</h2>;
}

function PracticeButton({ subject, chapter, label }: { subject: string; chapter?: string; label: string }) {
  return (
    <Link to="/pyq" search={practiceSearch(subject, chapter)} className="clay-btn inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white">
      {label}
    </Link>
  );
}

function TopicList({ items, empty }: { items: Topic[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-foreground/50">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm text-foreground/80">
      {items.map((t) => (
        <li key={t.name}>
          <span className="font-medium text-foreground">{topicLabel(t.name)}</span>{" "}
          <span className="text-foreground/50">
            — {t.total} {t.total === 1 ? "question" : "questions"}, {t.papers} {t.papers === 1 ? "paper" : "papers"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DataNote() {
  return <p className="mt-10 rounded-2xl bg-foreground/5 px-4 py-3 text-xs leading-relaxed text-foreground/60">{DATA_NOTE}</p>;
}

// ── Chapter page ───────────────────────────────────────────────────────────
export function ChapterView({ subjectKey, slug, topQuestions = [] }: { subjectKey: string; slug: string; topQuestions?: PyqRelated[] }) {
  const subject = getSubject(subjectKey) as Subject;
  const c = getChapter(subjectKey, slug) as Chapter;
  const ins = chapterInsights(c);
  const paras = chapterSummary(c, subject.total, subject.chapters.length);
  const faqs = chapterFaq(c, subject.total, subject.chapters.length);
  const near = [subject.chapters[c.rank - 3], subject.chapters[c.rank - 2], subject.chapters[c.rank], subject.chapters[c.rank + 1]].filter(Boolean) as Chapter[];
  const others = getSubjects().filter((s) => s.key !== subjectKey).map((s) => s.chapters[0]);

  return (
    <Page>
      <Crumbs
        items={[
          { label: "Home", to: <Link to="/" className="hover:underline">Home</Link> },
          { label: "NEET weightage", to: <Link to="/neet/chapter-wise-weightage" className="hover:underline">NEET weightage</Link> },
          { label: subject.name, to: <Link to="/neet/chapter-wise-weightage/$subject" params={{ subject: subject.key }} className="hover:underline">{subject.name}</Link> },
          { label: c.name },
        ]}
      />
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {c.name} <span className="text-foreground/60">— NEET {subject.name} PYQ weightage {RANGE_LABEL}</span>
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Questions" value={c.total} hint={`across 8 papers`} />
        <Stat label="Share of subject" value={`${c.share}%`} hint={`of ${subject.total} ${subject.name} Qs`} />
        <Stat label="Weightage rank" value={`#${c.rank}`} hint={`of ${subject.chapters.length} chapters`} />
        <div className="clay-inset rounded-2xl px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">Difficulty</p>
          <div className="mt-3">
            <DifficultyBar easy={c.easy} med={c.med} hard={c.hard} />
          </div>
          <DifficultyLegend easy={c.easy} med={c.med} hard={c.hard} />
        </div>
      </div>

      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-foreground/80">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <PracticeButton subject={subject.name} chapter={c.name} label={`Practise ${c.name} PYQs`} />
        <Link to="/neet/chapter-wise-weightage/$subject/$chapter/sheet" params={{ subject: subject.key, chapter: c.slug }} className="clay-chip rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/70">
          Free 20-question sheet (PDF)
        </Link>
        <Link to="/neet/chapter-wise-weightage/$subject" params={{ subject: subject.key }} className="clay-chip rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/70">
          All {subject.name} chapters
        </Link>
      </div>

      <SectionTitle>Questions per paper</SectionTitle>
      <div className="clay rounded-3xl p-5">
        <PaperBars years={c.years} caption={`${c.name}: questions in each NEET paper, ${RANGE_LABEL} (R = Re-NEET 2026)`} />
      </div>

      <SectionTitle>Topic-wise breakdown</SectionTitle>
      <p className="mb-3 text-sm text-foreground/60">
        {c.topics.length} topics tagged under {c.name}. Numbers show how many questions each topic had in each paper; E / M / H are the easy, medium and hard counts.
      </p>
      <div className="clay rounded-3xl p-4 sm:p-5">
        <TopicTable topics={c.topics} />
      </div>

      {topQuestions.length > 0 && (
        <>
          <SectionTitle>Recent {c.name} PYQs to practise</SectionTitle>
          <p className="mb-3 text-sm text-foreground/60">Questions from the latest papers, spread across the chapter's topics. Check your answer free on each page.</p>
          <ul className="space-y-2">
            {topQuestions.map((q) => (
              <li key={q.param}>
                <Link to="/question/$id" params={{ id: q.param }} className="clay block p-3.5 transition-colors hover:bg-foreground/[0.03]">
                  <p className="text-sm leading-snug text-foreground">{q.snippet || `${q.chapter} question`}</p>
                  <p className="mt-1.5 text-[11px] font-semibold text-foreground/50">
                    {q.label} · {q.difficulty}
                    {q.topic !== GENERAL_TOPIC ? ` · ${q.topic}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>What the papers tell us</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="clay-inset rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">Most tested topics</h3>
          <TopicList items={ins.mostTested} empty="No topics tagged." />
        </div>
        <div className="clay-inset rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">Repeated in 3 or more papers</h3>
          <TopicList items={ins.recurring} empty="No topic has appeared in three or more different papers." />
        </div>
        <div className="clay-inset rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">Asked in NEET 2026 / Re-NEET 2026</h3>
          <TopicList items={ins.latest} empty={`No question came from ${c.name} in the 2026 papers.`} />
        </div>
        <div className="clay-inset rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-bold text-foreground">Topics with hard questions</h3>
          <TopicList items={ins.hardest} empty="No question in this chapter was tagged hard." />
        </div>
      </div>

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={faqs} />

      <SectionTitle>Related chapters</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-foreground/70">Nearby in {subject.name} by weightage</h3>
          <ul className="space-y-1.5 text-sm">
            {near.map((n) => (
              <li key={n.slug}>
                <ChapterLink c={n} /> <span className="text-foreground/50">· #{n.rank}, {n.total} Qs</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-foreground/70">Top chapter in the other subjects</h3>
          <ul className="space-y-1.5 text-sm">
            {others.map((n) => (
              <li key={n.subjectKey + n.slug}>
                <ChapterLink c={n} showSubject /> <span className="text-foreground/50">· {n.total} Qs</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <DataNote />
    </Page>
  );
}

// ── Subject page ───────────────────────────────────────────────────────────
export function SubjectView({ subjectKey }: { subjectKey: string }) {
  const s = getSubject(subjectKey) as Subject;
  const intro = subjectIntro(s);
  const faqs = subjectFaq(s);
  const yearTotals = subjectYearTotals(s);

  return (
    <Page>
      <Crumbs
        items={[
          { label: "Home", to: <Link to="/" className="hover:underline">Home</Link> },
          { label: "NEET weightage", to: <Link to="/neet/chapter-wise-weightage" className="hover:underline">NEET weightage</Link> },
          { label: s.name },
        ]}
      />
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        NEET {s.name} chapter-wise weightage <span className="text-foreground/60">{RANGE_LABEL}</span>
      </h1>
      <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-foreground/80">
        {intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-5">
        <PracticeButton subject={s.name} label={`Practise NEET ${s.name} PYQs`} />
      </div>

      <SectionTitle>{s.name} questions per paper</SectionTitle>
      <div className="clay rounded-3xl p-5">
        <PaperBars years={yearTotals} caption={`NEET ${s.name}: questions tagged in each paper, ${RANGE_LABEL} (R = Re-NEET 2026)`} />
      </div>

      <SectionTitle>All {s.chapters.length} chapters ranked by weightage</SectionTitle>
      <div className="clay overflow-x-auto rounded-3xl p-4 sm:p-5" role="region" aria-label={`${s.name} chapters by weightage`} tabIndex={0}>
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
              <th scope="col" className="py-2 pr-2 font-semibold">
                #
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Chapter
              </th>
              <th scope="col" className="px-2 py-2 text-center font-semibold">
                Qs
              </th>
              <th scope="col" className="px-2 py-2 text-center font-semibold">
                Share
              </th>
              <th scope="col" className="w-44 px-2 py-2 font-semibold">
                Difficulty (E · M · H)
              </th>
            </tr>
          </thead>
          <tbody>
            {s.chapters.map((c) => (
              <tr key={c.slug} className="border-t border-foreground/10">
                <td className="py-2.5 pr-2 text-xs text-foreground/50">{c.rank}</td>
                <th scope="row" className="py-2.5 pr-3 text-[13px] font-medium">
                  <ChapterLink c={c} />
                </th>
                <td className="px-2 py-2.5 text-center text-xs font-bold text-foreground">{c.total}</td>
                <td className="px-2 py-2.5 text-center text-xs text-foreground/60">{c.share}%</td>
                <td className="px-2 py-2.5">
                  <DifficultyBar easy={c.easy} med={c.med} hard={c.hard} />
                  <p className="mt-1 text-[11px] text-foreground/50">
                    {c.easy} · {c.med} · {c.hard}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={faqs} />

      <SectionTitle>Other subjects</SectionTitle>
      <ul className="flex flex-wrap gap-2">
        {getSubjects()
          .filter((x) => x.key !== s.key)
          .map((x) => (
            <li key={x.key}>
              <Link to="/neet/chapter-wise-weightage/$subject" params={{ subject: x.key }} className="clay-chip rounded-full px-4 py-2 text-sm font-semibold text-foreground/80">
                NEET {x.name} weightage
              </Link>
            </li>
          ))}
      </ul>
      <DataNote />
    </Page>
  );
}

// ── Hub page ───────────────────────────────────────────────────────────────
export function HubView() {
  const subjects = getSubjects();
  const top = topChaptersOverall(12);
  const easy = easiestChapters(10, 10);
  const topics = mostRepeatedTopics(12);
  const faqs = hubFaq();

  return (
    <Page>
      <Crumbs
        items={[
          { label: "Home", to: <Link to="/" className="hover:underline">Home</Link> },
          { label: "NEET chapter-wise weightage" },
        ]}
      />
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        NEET chapter-wise weightage <span className="text-foreground/60">{RANGE_LABEL}</span>
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-foreground/80">
        Which chapters does NEET actually ask from? Edurack mapped {totalQuestions()} previous-year questions from NEET {RANGE_LABEL} and Re-NEET 2026 to {totalChapters()} NCERT
        chapters across Physics, Chemistry, Botany and Zoology. Pick a subject to see every chapter ranked, then open a chapter for its topic-wise question counts in each paper.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {subjects.map((s) => (
          <Link key={s.key} to="/neet/chapter-wise-weightage/$subject" params={{ subject: s.key }} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
            <h2 className="font-display text-xl font-bold text-foreground">NEET {s.name}</h2>
            <p className="mt-1 text-sm text-foreground/60">
              {s.total} questions · {s.chapters.length} chapters
            </p>
            <p className="mt-3 text-xs text-foreground/50">Highest weightage</p>
            <p className="text-sm font-medium text-foreground">
              {s.chapters
                .slice(0, 3)
                .map((c) => `${c.name} (${c.total})`)
                .join(" · ")}
            </p>
          </Link>
        ))}
      </div>

      <SectionTitle>Highest-weightage chapters across NEET</SectionTitle>
      <ol className="clay space-y-2 rounded-3xl p-5 text-sm">
        {top.map((c, i) => (
          <li key={c.subjectKey + c.slug} className="flex items-baseline gap-3">
            <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
            <span className="flex-1">
              <ChapterLink c={c} showSubject />
            </span>
            <span className="text-xs font-bold text-foreground">{c.total} Qs</span>
          </li>
        ))}
      </ol>

      <SectionTitle>Most scoring chapters (highest share of easy questions)</SectionTitle>
      <p className="mb-3 text-sm text-foreground/60">Chapters with at least 10 questions, ranked by the share of easy questions among those tagged for difficulty.</p>
      <ol className="clay space-y-2 rounded-3xl p-5 text-sm">
        {easy.map((c, i) => (
          <li key={c.subjectKey + c.slug} className="flex items-baseline gap-3">
            <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
            <span className="flex-1">
              <ChapterLink c={c} showSubject />
            </span>
            <span className="text-xs text-foreground/60">
              {c.easy} of {c.easy + c.med + c.hard} easy
            </span>
          </li>
        ))}
      </ol>

      <SectionTitle>Most repeated topics in NEET</SectionTitle>
      <ol className="clay space-y-2 rounded-3xl p-5 text-sm">
        {topics.map((t, i) => (
          <li key={t.chapter.subjectKey + t.chapter.slug + t.name} className="flex items-baseline gap-3">
            <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
            <span className="flex-1">
              <span className="font-medium text-foreground">{topicLabel(t.name)}</span> <span className="text-foreground/50">· </span>
              <ChapterLink c={t.chapter} showSubject />
            </span>
            <span className="text-xs font-bold text-foreground">{t.total} Qs</span>
          </li>
        ))}
      </ol>

      <SectionTitle>More NEET resources</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["/neet/paper-analysis", "NEET paper analysis 2020–2026", "Year-by-year chapter counts and what changed."],
          ["/neet/most-repeated-topics", "Most repeated topics", "The topics NEET keeps coming back to."],
          ["/neet/question-of-the-day", "Question of the day", "One free NEET PYQ every day."],
          ["/tools", "Free NEET tools", "Rank predictor, percentile calculator, target planner."],
        ] as const).map(([to, title, blurb]) => (
          <a key={to} href={to} className="clay block rounded-2xl p-4 transition hover:-translate-y-0.5">
            <p className="text-sm font-bold text-foreground">{title}</p>
            <p className="text-xs text-foreground/60">{blurb}</p>
          </a>
        ))}
      </div>

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={faqs} />
      <DataNote />
    </Page>
  );
}
