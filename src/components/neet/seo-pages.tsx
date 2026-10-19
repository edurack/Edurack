// Public SEO pages built from the tagged dataset: paper-by-paper analysis and most-repeated topics.
// Server-rendered like the blueprint pages: all text, tables and links are in the HTML Google reads.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PAPER_LABELS, RANGE_LABEL, chapterPath, practiceSearch, topicLabel, type Chapter } from "@/lib/neet-blueprint";
import { DATA_NOTE, type Faq } from "@/lib/neet-blueprint-copy";
import { PAPER_SLUGS, analyzePaper, paperIntro, paperPath, type PaperAnalysis } from "@/lib/neet-paper-analysis";
import { analyzePaperSubject, paperSubjectIntro, type PaperSubject } from "@/lib/neet-paper-subject";
import { everyYearTopics, overallTopics, topicsBySubject, type RepeatedTopic } from "@/lib/neet-topics";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

function Page({ crumbs, children }: { crumbs: { label: string; to?: string }[]; children: ReactNode }) {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
          <Link to="/" className="hover:underline">Home</Link>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              {c.to ? <a href={c.to} className="hover:underline">{c.label}</a> : <span className="font-semibold text-foreground/80">{c.label}</span>}
            </span>
          ))}
        </nav>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

const H2 = ({ children }: { children: ReactNode }) => <h2 className="mb-3 mt-10 font-display text-xl font-bold text-foreground sm:text-2xl">{children}</h2>;

function Faqs({ faqs }: { faqs: Faq[] }) {
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

function ChapterLink({ c, showSubject = true }: { c: Chapter; showSubject?: boolean }) {
  return (
    <Link to="/neet/chapter-wise-weightage/$subject/$chapter" params={{ subject: c.subjectKey, chapter: c.slug }} className="font-semibold text-foreground underline-offset-2 hover:underline">
      {c.name}
      {showSubject && <span className="font-normal text-foreground/50"> · {c.subjectName}</span>}
    </Link>
  );
}

function Practice({ line, subject = "Biology" }: { line: string; subject?: string }) {
  return (
    <div className="ink-section mt-10 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display text-lg font-extrabold">{line}</p>
        <p className="mt-1 text-sm text-white/65">Free NEET PYQs with solutions. Try your first 5 without logging in.</p>
      </div>
      <Link to="/pyq" search={practiceSearch(subject) as never} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#ffffff] px-6 text-sm font-extrabold text-[#141b2b]">Practise NEET PYQs</Link>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
      <div className="h-full rounded-full bg-[#141b2b]" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

// ── /neet/paper-analysis ─────────────────────────────────────────────────
export function PaperIndexView() {
  const papers = PAPER_SLUGS.map((s) => analyzePaper(s)!).reverse();
  return (
    <Page crumbs={[{ label: "NEET paper analysis" }]}>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">NEET paper analysis <span className="text-foreground/60">{RANGE_LABEL}</span></h1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
        See where each NEET paper's questions came from. Pick a year for the chapter-wise count, the most-asked topics, topics that appeared for the first time, and chapters that were skipped.
      </p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {papers.map((a) => (
          <Link key={a.slug} to="/neet/paper-analysis/$year" params={{ year: a.slug }} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
            <h2 className="font-display text-xl font-bold text-foreground">{a.label} analysis</h2>
            <p className="mt-1 text-sm text-foreground/60">{a.total} tagged questions · {a.subjects.map((s) => `${s.name.slice(0, 4)} ${s.count}`).join(" · ")}</p>
            {a.topChapters[0] && <p className="mt-3 text-sm text-foreground/80">Most questions: <span className="font-semibold">{a.topChapters[0].chapter.name}</span> ({a.topChapters[0].count})</p>}
          </Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-foreground/50">{DATA_NOTE}</p>
    </Page>
  );
}

function TopicRows({ topics, mode }: { topics: { name: string; chapter: Chapter; value: string }[]; mode?: "plain" }) {
  void mode;
  return (
    <ol className="clay space-y-2 rounded-3xl p-5 text-sm">
      {topics.map((t, i) => (
        <li key={t.chapter.slug + t.name} className="flex items-baseline gap-3">
          <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
          <span className="flex-1">
            <span className="font-medium text-foreground">{topicLabel(t.name)}</span> <span className="text-foreground/50">· </span>
            <ChapterLink c={t.chapter} />
          </span>
          <span className="shrink-0 text-xs font-bold text-foreground">{t.value}</span>
        </li>
      ))}
    </ol>
  );
}

export function PaperView({ slug, faqs }: { slug: string; faqs: Faq[] }) {
  const a = analyzePaper(slug) as PaperAnalysis;
  const maxCount = a.allChapters[0]?.count ?? 1;
  const others = PAPER_SLUGS.filter((s) => s !== slug);
  return (
    <Page crumbs={[{ label: "NEET paper analysis", to: "/neet/paper-analysis" }, { label: a.label }]}>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{a.label} paper analysis</h1>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground/80">{paperIntro(a).map((p) => <p key={p}>{p}</p>)}</div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {a.subjects.map((s) => (
          <Link key={s.key} to="/neet/paper-analysis/$year/$subject" params={{ year: a.slug, subject: s.key }} className="clay-inset block rounded-2xl px-4 py-3 transition hover:-translate-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">{s.name}</p>
            <p className="font-display mt-0.5 text-2xl font-bold">{s.count}</p>
            <p className="text-xs text-foreground/50">{s.share}% of questions</p>
            <p className="mt-1.5 text-xs font-bold text-[var(--sky-deep)]">{s.name} chapter-wise →</p>
          </Link>
        ))}
      </div>

      <H2>Chapters with the most questions in {a.label}</H2>
      <div className="clay overflow-x-auto rounded-3xl p-5">
        <table className="w-full min-w-[440px] text-left text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wide text-foreground/45"><th className="py-2 pr-3">Chapter</th><th className="py-2 pr-3 w-1/3">Questions</th><th className="py-2 text-right">{a.index > 0 ? `vs ${PAPER_LABELS[a.index - 1]}` : ""}</th></tr></thead>
          <tbody>
            {a.allChapters.slice(0, 20).map((r) => (
              <tr key={r.chapter.subjectKey + r.chapter.slug} className="border-t border-border align-middle">
                <td className="py-2.5 pr-3"><ChapterLink c={r.chapter} /></td>
                <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><span className="w-5 text-right font-bold">{r.count}</span><Bar value={r.count} max={maxCount} /></div></td>
                <td className="py-2.5 text-right text-xs text-foreground/60">{r.prev === null ? "" : r.count - r.prev === 0 ? "same" : r.count > r.prev ? `+${r.count - r.prev}` : `${r.count - r.prev}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(a.biggestRise || a.biggestDrop) && (
        <>
          <H2>What changed from {PAPER_LABELS[a.index - 1]}</H2>
          <ul className="space-y-2 text-[15px] text-foreground/80">
            {a.biggestRise && <li>Biggest rise: <ChapterLink c={a.biggestRise.chapter} /> went from {a.biggestRise.prev} to {a.biggestRise.count} questions.</li>}
            {a.biggestDrop && <li>Biggest drop: <ChapterLink c={a.biggestDrop.chapter} /> went from {a.biggestDrop.prev} to {a.biggestDrop.count} questions.</li>}
          </ul>
        </>
      )}

      <H2>Most-asked topics in {a.label}</H2>
      <TopicRows topics={a.topTopics.map((t) => ({ name: t.name, chapter: t.chapter, value: `${t.inPaper} Qs` }))} />

      {a.firstTimeTopics.length > 0 && (
        <>
          <H2>Topics asked for the first time in {a.label}</H2>
          <p className="mb-3 text-sm text-foreground/60">These topics had no question in any earlier paper in this set.</p>
          <TopicRows topics={a.firstTimeTopics.map((t) => ({ name: t.name, chapter: t.chapter, value: `${t.inPaper} Qs` }))} />
        </>
      )}

      {a.absent.length > 0 && (
        <>
          <H2>Chapters with no question in {a.label}</H2>
          <p className="text-sm leading-relaxed text-foreground/75">
            {a.absent.map((c, i) => <span key={c.subjectKey + c.slug}>{i > 0 && ", "}<ChapterLink c={c} showSubject={false} /></span>)}
          </p>
        </>
      )}

      <Practice line={`Practise the chapters ${a.label} leaned on`} />

      <H2>Frequently asked questions</H2>
      <Faqs faqs={faqs} />

      <H2>Other NEET papers</H2>
      <div className="flex flex-wrap gap-2">
        {others.map((s) => (
          <Link key={s} to="/neet/paper-analysis/$year" params={{ year: s }} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 hover:border-foreground/40">{PAPER_LABELS[PAPER_SLUGS.indexOf(s)]}</Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-foreground/50">{DATA_NOTE}</p>
    </Page>
  );
}

// ── /neet/paper-analysis/<year>/<subject> ────────────────────────────────
const delta = (count: number, prev: number | null) => (prev === null ? "" : count === prev ? "same" : count > prev ? `+${count - prev}` : `${count - prev}`);

export function PaperSubjectView({ paperSlug, subjectKey, faqs }: { paperSlug: string; subjectKey: string; faqs: Faq[] }) {
  const a = analyzePaperSubject(paperSlug, subjectKey) as PaperSubject;
  const s = a.subject;
  const maxCount = a.chapters[0]?.count ?? 1;
  const otherSubjects = ["physics", "chemistry", "botany", "zoology"].filter((k) => k !== subjectKey && analyzePaperSubject(paperSlug, k));
  const stat = (label: string, value: ReactNode, hint: string) => (
    <div className="clay-inset rounded-2xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">{label}</p>
      <p className="font-display mt-0.5 text-2xl font-bold">{value}</p>
      <p className="text-xs text-foreground/50">{hint}</p>
    </div>
  );
  return (
    <Page crumbs={[{ label: "NEET paper analysis", to: "/neet/paper-analysis" }, { label: a.label, to: paperPath(a.slug) }, { label: s.name }]}>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{a.label} {s.name} paper analysis</h1>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground/80">{paperSubjectIntro(a).map((p) => <p key={p}>{p}</p>)}</div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Questions", a.count, `${s.name} in ${a.label}`)}
        {stat("Share of paper", `${a.share}%`, `of ${a.paperTotal} tagged questions`)}
        {stat("Chapters asked", `${a.chapters.length}/${s.chapters.length}`, `${a.absent.length} had no question`)}
        {stat(a.prevLabel ? `vs ${a.prevLabel}` : "Rank of 8 papers", a.prevCount === null ? `#${a.rank}` : delta(a.count, a.prevCount), a.prevCount === null ? `by ${s.name} count` : `${a.prevCount} then, ${a.count} now`)}
      </div>

      <H2>{s.name} chapters and topics asked in {a.label}</H2>
      <p className="mb-3 text-sm text-foreground/60">Chapters are ranked by questions in this paper. Under each chapter are the topics that were asked; “new” marks a topic with no question in any earlier paper.</p>
      <ul className="clay divide-y divide-border rounded-3xl px-5">
        {a.chapters.map((r) => (
          <li key={r.chapter.slug} className="py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-[15px]"><ChapterLink c={r.chapter} showSubject={false} /></span>
              <span className="hidden w-28 sm:block"><Bar value={r.count} max={maxCount} /></span>
              <span className="w-6 text-right text-sm font-bold text-foreground">{r.count}</span>
              <span className="w-12 text-right text-xs text-foreground/55">{delta(r.count, r.prev)}</span>
            </div>
            {r.topics.length > 0 && (
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
                {r.topics.map((t, i) => (
                  <span key={t.name}>
                    {i > 0 && " · "}
                    {topicLabel(t.name, 70)}
                    {t.inPaper > 1 ? ` ×${t.inPaper}` : ""}
                    {t.firstTime && <span className="font-semibold text-[var(--sky-deep)]"> new</span>}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>

      {(a.biggestRise || a.biggestDrop) && a.prevLabel && (
        <>
          <H2>What changed from {a.prevLabel}</H2>
          <ul className="space-y-2 text-[15px] text-foreground/80">
            {a.biggestRise && <li>Biggest rise: <ChapterLink c={a.biggestRise.chapter} showSubject={false} /> went from {a.biggestRise.from} to {a.biggestRise.to} questions.</li>}
            {a.biggestDrop && <li>Biggest drop: <ChapterLink c={a.biggestDrop.chapter} showSubject={false} /> went from {a.biggestDrop.from} to {a.biggestDrop.to} questions.</li>}
          </ul>
        </>
      )}

      {a.firstTimeTopics.length > 0 && (
        <>
          <H2>{s.name} topics asked for the first time in {a.label}</H2>
          <TopicRows topics={a.firstTimeTopics.map((t) => ({ name: t.name, chapter: t.chapter, value: `${t.inPaper} Qs` }))} />
        </>
      )}

      {a.absent.length > 0 && (
        <>
          <H2>{s.name} chapters with no question in {a.label}</H2>
          <p className="text-sm leading-relaxed text-foreground/75">
            {a.absent.map((c, i) => <span key={c.slug}>{i > 0 && ", "}<ChapterLink c={c} showSubject={false} /></span>)}
          </p>
        </>
      )}

      <Practice line={`Practise ${s.name} PYQs`} subject={s.name} />

      <H2>{s.name} across the 8 papers</H2>
      <div className="flex flex-wrap gap-2">
        {a.perPaper.map((p) =>
          p.slug === a.slug ? (
            <span key={p.slug} className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background">{p.label} · {p.count}</span>
          ) : (
            <Link key={p.slug} to="/neet/paper-analysis/$year/$subject" params={{ year: p.slug, subject: subjectKey }} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 hover:border-foreground/40">{p.label} · {p.count}</Link>
          ),
        )}
      </div>

      <H2>{a.label} in the other subjects</H2>
      <div className="flex flex-wrap gap-2">
        {otherSubjects.map((k) => (
          <Link key={k} to="/neet/paper-analysis/$year/$subject" params={{ year: a.slug, subject: k }} className="rounded-full border border-border px-4 py-2 text-xs font-bold capitalize text-foreground/70 hover:border-foreground/40">{k}</Link>
        ))}
        <Link to="/neet/paper-analysis/$year" params={{ year: a.slug }} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 hover:border-foreground/40">Full {a.label} analysis</Link>
        <Link to="/neet/chapter-wise-weightage/$subject" params={{ subject: subjectKey }} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 hover:border-foreground/40">{s.name} weightage, all papers</Link>
      </div>

      <H2>Frequently asked questions</H2>
      <Faqs faqs={faqs} />
      <p className="mt-8 text-xs text-foreground/50">{DATA_NOTE} Counts cover {RANGE_LABEL}.</p>
    </Page>
  );
}

// ── /neet/most-repeated-topics ───────────────────────────────────────────
export function TopicsView({ faqs }: { faqs: Faq[] }) {
  const overall = overallTopics(30);
  const bySubject = topicsBySubject(20);
  const every = everyYearTopics();
  const row = (t: RepeatedTopic) => ({ name: t.name, chapter: t.chapter, value: `${t.total} Qs · ${t.papers}/8 papers` });
  return (
    <Page crumbs={[{ label: "Most repeated topics" }]}>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Most repeated topics in NEET <span className="text-foreground/60">{RANGE_LABEL}</span></h1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
        Some NEET topics show up again and again. This list ranks topics by how many questions they produced across NEET {RANGE_LABEL} and Re-NEET 2026, and by how many of the 8 papers they appeared in. Start your revision here.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {bySubject.map((s) => <a key={s.key} href={`#${s.key}`} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 hover:border-foreground/40">{s.name}</a>)}
      </div>

      <H2>Top 30 repeated topics across all subjects</H2>
      <TopicRows topics={overall.map(row)} />

      {every.length > 0 && (
        <>
          <H2>Topics asked in 5 or more of the 8 papers</H2>
          <p className="mb-3 text-sm text-foreground/60">These are the closest thing to "guaranteed" topics. Master them first.</p>
          <TopicRows topics={every.map(row)} />
        </>
      )}

      {bySubject.map((s) => (
        <section key={s.key} id={s.key}>
          <H2>Most repeated {s.name} topics</H2>
          <TopicRows topics={s.topics.map(row)} />
        </section>
      ))}

      <Practice line="Turn repeated topics into marks" />
      <H2>Frequently asked questions</H2>
      <Faqs faqs={faqs} />
      <p className="mt-8 text-xs text-foreground/50">{DATA_NOTE}</p>
      <p className="mt-2 text-xs text-foreground/50">See also: <Link to="/neet/chapter-wise-weightage" className="underline">chapter-wise weightage</Link> · <Link to="/neet/paper-analysis" className="underline">paper analysis</Link> · <Link to="/tools" className="underline">free NEET tools</Link></p>
    </Page>
  );
}

export { chapterPath, paperPath };
