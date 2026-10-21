// src/components/jee/jee-extra-views.tsx
//
// Extra public JEE pages: paper analysis (hub, year, year + subject), syllabus (hub, subject, Paper 2),
// removed chapters, high-weightage chapters and chapter trends. Server-rendered like the rest of the
// public site, so all text, tables and links are in the HTML Google reads.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  EARLIER_LABEL,
  JEE_RANGE,
  RECENT_LABEL,
  YEARS,
  droppedChapters,
  getJeeSubject,
  getJeeSubjects,
  jeeActiveChapters,
  topJeeChaptersOverall,
} from "@/lib/jee-blueprint";
import { analyzeSubjectYear, analyzeYear, yearDataCaution, type ChapterYearRow } from "@/lib/jee-paper-analysis";
import { coverage, movers, removedByLastYear } from "@/lib/jee-insights";
import { CHEM_PRACTICAL, PAPER2, PHYSICS_EXPERIMENTS, getPaper2, syllabusUnits } from "@/lib/jee-syllabus";
import {
  highFaq,
  highIntro,
  paper2Faq,
  paperHubFaq,
  removedFaq,
  removedIntro,
  syllabusHubFaq,
  syllabusHubIntro,
  syllabusSubjectFaq,
  syllabusSubjectIntro,
  trendsFaq,
  trendsIntro,
  yearFaq,
  yearIntro,
  yearSubjectFaq,
  yearSubjectIntro,
} from "@/lib/jee-extra-copy";
import { JEE_DATA_NOTE } from "@/lib/jee-blueprint-copy";
import { ChapterLink, Crumbs, DataNote, FaqList, H1, Page, PracticeCta, SectionTitle, Stat, TrendBadge } from "@/components/jee/jee-views";
import { RelatedGuides } from "@/components/jee/jee-related";

const fmt = (n: number) => n.toLocaleString("en-IN");
const Card = ({ children }: { children: ReactNode }) => <div className="clay rounded-3xl p-5">{children}</div>;
const Lead = ({ paras }: { paras: string[] }) => (
  <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground/80">
    {paras.map((p) => (
      <p key={p}>{p}</p>
    ))}
  </div>
);
const hubCrumb = (label: string, to: ReactNode) => ({ label, to });

function YearLinks({ current, subjectKey }: { current: string; subjectKey?: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      {YEARS.map((y) =>
        y === current ? (
          <span key={y} className="clay-inset rounded-full px-4 py-1.5 font-bold text-foreground">{y}</span>
        ) : subjectKey ? (
          <Link key={y} to="/jee/paper-analysis/$year/$subject" params={{ year: y, subject: subjectKey }} className="clay rounded-full px-4 py-1.5 font-semibold text-foreground">{y}</Link>
        ) : (
          <Link key={y} to="/jee/paper-analysis/$year" params={{ year: y }} className="clay rounded-full px-4 py-1.5 font-semibold text-foreground">{y}</Link>
        ),
      )}
    </div>
  );
}

function Delta({ d }: { d?: number }) {
  if (d === undefined) return <span className="text-foreground/30">–</span>;
  if (d === 0) return <span className="text-foreground/50">0</span>;
  return <span className={d > 0 ? "font-semibold text-foreground" : "font-semibold text-foreground/60"}>{d > 0 ? `+${d}` : d}</span>;
}

function YearTable({ rows, hasPrev, showSubject = false }: { rows: ChapterYearRow[]; hasPrev: boolean; showSubject?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl" role="region" aria-label="Chapter-wise question counts for the year" tabIndex={0}>
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
            <th scope="col" className="w-8 py-2 pr-2 font-semibold">#</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Chapter</th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">Questions</th>
            <th scope="col" className="px-2 py-2 text-center font-semibold">Share</th>
            {hasPrev && <th scope="col" className="px-2 py-2 text-center font-semibold">Share last year</th>}
            {hasPrev && <th scope="col" className="px-2 py-2 text-center font-semibold">Change (pts)</th>}
            <th scope="col" className="px-2 py-2 text-center font-semibold">Now</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.chapter.subjectKey + r.chapter.slug} className="border-t border-foreground/10">
              <td className="py-2 pr-2 text-xs text-foreground/40">{i + 1}</td>
              <th scope="row" className="py-2 pr-3 text-[13px] font-medium leading-snug"><ChapterLink c={r.chapter} showSubject={showSubject} /></th>
              <td className="px-2 py-2 text-center text-xs font-bold text-foreground">{r.count}</td>
              <td className="px-2 py-2 text-center text-xs text-foreground/70">{r.share}%</td>
              {hasPrev && <td className="px-2 py-2 text-center text-xs text-foreground/70">{r.prevShare !== undefined ? `${r.prevShare}%` : "–"}</td>}
              {hasPrev && <td className="px-2 py-2 text-center text-xs"><Delta d={r.delta} /></td>}
              <td className="px-2 py-2 text-center"><TrendBadge c={r.chapter} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── /jee/paper-analysis ─────────────────────────────────────────────────────
export function PaperHubView() {
  const years = [...YEARS].reverse();
  return (
    <Page>
      <Crumbs items={[{ label: "JEE paper analysis" }]} />
      <H1>JEE Main paper analysis <span className="text-foreground/60">{JEE_RANGE}</span></H1>
      <Lead paras={[`See where each year's JEE Main questions came from. Pick a year for chapter-wise counts across Physics, Chemistry and Maths, the chapters that gained or lost share, and the most repeated concepts of that year.`]} />
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {years.map((y) => {
          const a = analyzeYear(y)!;
          return (
            <Link key={y} to="/jee/paper-analysis/$year" params={{ year: y }} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
              <h2 className="font-display text-xl font-bold text-foreground">JEE Main {y} analysis</h2>
              <p className="mt-1 text-sm text-foreground/60">{fmt(a.total)} questions · {a.subjects.map((s) => `${s.subject.short.slice(0, 4)} ${fmt(s.total)}`).join(" · ")}</p>
              <p className="mt-3 text-sm text-foreground/80">Biggest chapter: <span className="font-semibold">{a.top[0].chapter.name}</span> ({a.top[0].chapter.subjectShort})</p>
            </Link>
          );
        })}
      </div>
      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={paperHubFaq()} />
      <RelatedGuides exclude={["paper-analysis"]} />
      <DataNote />
    </Page>
  );
}

// ── /jee/paper-analysis/<year> ──────────────────────────────────────────────
export function PaperYearView({ year }: { year: string }) {
  const a = analyzeYear(year)!;
  const caution = yearDataCaution(year);
  return (
    <Page>
      <Crumbs items={[hubCrumb("JEE paper analysis", <Link to="/jee/paper-analysis" className="hover:underline">JEE paper analysis</Link>), { label: year }]} />
      <H1>JEE Main {year} paper analysis <span className="text-foreground/60">chapter-wise</span></H1>
      <Lead paras={yearIntro(a)} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Questions counted" value={fmt(a.total)} hint="across all shifts" />
        {a.subjects.map((s) => (
          <Stat key={s.subject.key} label={s.subject.name} value={fmt(s.total)} hint={`${s.rows.length} chapters asked`} />
        ))}
      </div>
      <YearLinks current={year} />

      <SectionTitle>Highest-weightage chapters in {year}</SectionTitle>
      <Card>
        <ol className="space-y-2 text-sm">
          {a.top.map((r, i) => (
            <li key={r.chapter.subjectKey + r.chapter.slug} className="flex items-baseline gap-3">
              <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
              <span className="flex-1"><ChapterLink c={r.chapter} showSubject /></span>
              <span className="shrink-0 text-xs font-bold text-foreground">{r.count} Qs · {r.paperShare}% of paper</span>
            </li>
          ))}
        </ol>
      </Card>

      <SectionTitle>{year} by subject</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        {a.subjects.map((s) => (
          <div key={s.subject.key} className="clay rounded-3xl p-5">
            <Link to="/jee/paper-analysis/$year/$subject" params={{ year, subject: s.subject.key }} className="font-display text-lg font-bold text-foreground hover:underline">
              {s.subject.name} {year} analysis
            </Link>
            <ol className="mt-3 space-y-1 text-sm text-foreground/80">
              {s.rows.slice(0, 5).map((r) => (
                <li key={r.chapter.slug} className="flex items-baseline justify-between gap-2">
                  <ChapterLink c={r.chapter} />
                  <span className="shrink-0 text-xs text-foreground/50">{r.count}</span>
                </li>
              ))}
            </ol>
            <Link to="/jee/paper-analysis/$year/$subject" params={{ year, subject: s.subject.key }} className="mt-3 inline-block text-xs font-bold text-[var(--sky-deep)]">All {s.subject.short} chapters →</Link>
          </div>
        ))}
      </div>

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={yearFaq(a)} />
      <PracticeCta line={`Practise what JEE Main ${year} asked`} />
      <RelatedGuides exclude={["paper-analysis"]} />
      {caution && <p className="mt-8 text-xs leading-relaxed text-foreground/50">{caution}</p>}
      <DataNote />
    </Page>
  );
}

// ── /jee/paper-analysis/<year>/<subject> ────────────────────────────────────
export function PaperSubjectView({ year, subjectKey }: { year: string; subjectKey: string }) {
  const sy = analyzeSubjectYear(year, subjectKey)!;
  const s = sy.subject;
  const caution = yearDataCaution(year, subjectKey);
  return (
    <Page>
      <Crumbs
        items={[
          hubCrumb("JEE paper analysis", <Link to="/jee/paper-analysis" className="hover:underline">JEE paper analysis</Link>),
          hubCrumb(year, <Link to="/jee/paper-analysis/$year" params={{ year }} className="hover:underline">{year}</Link>),
          { label: s.name },
        ]}
      />
      <H1>JEE Main {year} {s.name} <span className="text-foreground/60">chapter-wise analysis</span></H1>
      <Lead paras={yearSubjectIntro(sy)} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Questions counted" value={fmt(sy.total)} hint="across all shifts" />
        <Stat label="Chapters asked" value={sy.rows.length} hint={`of ${s.chapters.length} in the dataset`} />
        <Stat label="Most asked" value={sy.rows[0].chapter.name} hint={`${sy.rows[0].count} Qs (${sy.rows[0].share}%)`} />
      </div>
      <p className="mt-3 text-sm text-foreground/60">Other years:</p>
      <YearLinks current={year} subjectKey={subjectKey} />

      <SectionTitle>{s.name} chapters in {year}</SectionTitle>
      <Card><YearTable rows={sy.rows} hasPrev={sy.yi > 0} /></Card>

      {sy.concepts.length > 0 && (
        <>
          <SectionTitle>Most repeated {s.name} concepts in {year}</SectionTitle>
          <Card>
            <ol className="space-y-2 text-sm">
              {sy.concepts.map((x, i) => (
                <li key={x.concept.name} className="flex items-baseline gap-3">
                  <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
                  <span className="flex-1 font-medium text-foreground">{x.concept.name}</span>
                  <span className="shrink-0 text-xs font-bold text-foreground">{x.count} Qs</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}

      {sy.skipped.length > 0 && (
        <>
          <SectionTitle>Chapters with no questions in {year}</SectionTitle>
          <Card>
            <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {sy.skipped.map((c) => (
                <li key={c.slug}><ChapterLink c={c} /></li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <p className="mt-8 text-sm">
        <Link to="/jee/chapter-wise-weightage/$subject" params={{ subject: s.key }} className="font-bold text-[var(--sky-deep)]">{s.name} chapter-wise weightage {JEE_RANGE} →</Link>
        {"  "}
        <Link to="/jee/syllabus/$subject" params={{ subject: s.key }} className="ml-4 font-bold text-[var(--sky-deep)]">{s.name} syllabus 2026 →</Link>
      </p>
      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={yearSubjectFaq(sy)} />
      <PracticeCta line={`Practise JEE Main ${s.name} PYQs`} subject={s.short} />
      <RelatedGuides exclude={["paper-analysis"]} />
      {caution && <p className="mt-8 text-xs leading-relaxed text-foreground/50">{caution}</p>}
      <DataNote />
    </Page>
  );
}

// ── /jee/syllabus ───────────────────────────────────────────────────────────
export function SyllabusHubView() {
  return (
    <Page>
      <Crumbs items={[{ label: "JEE Main syllabus" }]} />
      <H1>JEE Main syllabus <span className="text-foreground/60">2026</span></H1>
      <Lead paras={syllabusHubIntro()} />
      <SectionTitle>Paper 1 (B.E./B.Tech.)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        {getJeeSubjects().map((s) => (
          <Link key={s.key} to="/jee/syllabus/$subject" params={{ subject: s.key }} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
            <h2 className="font-display text-xl font-bold text-foreground">{s.name} syllabus</h2>
            <p className="mt-1 text-sm text-foreground/60">{s.activeCount} units</p>
            <p className="mt-3 text-xs text-foreground/60">Largest unit: <span className="font-semibold text-foreground">{s.chapters[0].name}</span></p>
          </Link>
        ))}
      </div>
      <SectionTitle>Paper 2 (B.Arch and B.Planning)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {PAPER2.map((p) => (
          <Link key={p.key} to="/jee/syllabus/$subject" params={{ subject: p.key }} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
            <h2 className="font-display text-xl font-bold text-foreground">{p.name} syllabus</h2>
            <p className="mt-1 text-sm text-foreground/60">{p.parts.map((x) => x.title.replace(/^Part [IV]+: /, "")).join(" · ")}</p>
          </Link>
        ))}
      </div>
      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={syllabusHubFaq()} />
      <RelatedGuides exclude={["syllabus"]} />
      <p className="mt-8 text-xs leading-relaxed text-foreground/50">Topic lists paraphrase the JEE Main 2026 syllabus published by NTA. Weightage figures come from the Careers360 JEE Main analysis for {JEE_RANGE}. Confirm the latest syllabus on the official NTA website.</p>
    </Page>
  );
}

// ── /jee/syllabus/<physics|chemistry|maths> ─────────────────────────────────
export function SyllabusSubjectView({ subjectKey }: { subjectKey: string }) {
  const s = getJeeSubject(subjectKey)!;
  const units = syllabusUnits(subjectKey);
  const dropped = s.chapters.filter((c) => c.retired);
  return (
    <Page>
      <Crumbs items={[hubCrumb("JEE Main syllabus", <Link to="/jee/syllabus" className="hover:underline">JEE Main syllabus</Link>), { label: s.name }]} />
      <H1>JEE Main {s.name} syllabus <span className="text-foreground/60">2026, unit-wise</span></H1>
      <Lead paras={syllabusSubjectIntro(subjectKey)} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Units" value={units.length} />
        <Stat label="Largest unit" value={s.chapters[0].name} hint={`${s.chapters[0].recentShare}% in ${RECENT_LABEL}`} />
        <Stat label="Not in syllabus" value={dropped.length} hint="chapters from earlier papers" />
      </div>

      <SectionTitle>{s.name} units and topics</SectionTitle>
      <ol className="space-y-3">
        {units.map(({ unit, chapter: c }) => (
          <li key={c.slug} className="clay rounded-3xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-foreground">Unit {unit}: <ChapterLink c={c} /></h3>
              <span className="text-xs font-semibold text-foreground/60">{c.recentShare}% of {s.short} in {RECENT_LABEL} · #{c.rank}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/75">{c.syllabus}</p>
            {subjectKey === "physics" && unit === 20 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/75">
                {PHYSICS_EXPERIMENTS.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {subjectKey === "chemistry" && unit === 20 && (
              <div className="mt-3 space-y-3 text-sm text-foreground/75">
                {CHEM_PRACTICAL.map((g) => (
                  <div key={g.title}>
                    <p className="font-semibold text-foreground">{g.title}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {g.items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      {dropped.length > 0 && (
        <p className="mt-6 text-sm text-foreground/70">
          Not in this syllabus: {dropped.map((c) => c.name).join(", ")}. <Link to="/jee/removed-chapters" className="font-bold text-[var(--sky-deep)]">See removed chapters →</Link>
        </p>
      )}

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={syllabusSubjectFaq(subjectKey)} />
      <PracticeCta line={`Practise JEE Main ${s.name} PYQs`} subject={s.short} />
      <RelatedGuides exclude={["syllabus"]} />
      <p className="mt-8 text-xs leading-relaxed text-foreground/50">Topic lists paraphrase the JEE Main 2026 syllabus published by NTA. Weightage figures come from the Careers360 JEE Main analysis for {JEE_RANGE}. Confirm the latest syllabus on the official NTA website.</p>
    </Page>
  );
}

// ── /jee/syllabus/<paper-2a-barch|paper-2b-bplanning> ───────────────────────
export function Paper2View({ paperKey }: { paperKey: string }) {
  const p = getPaper2(paperKey)!;
  const other = PAPER2.find((x) => x.key !== paperKey)!;
  return (
    <Page>
      <Crumbs items={[hubCrumb("JEE Main syllabus", <Link to="/jee/syllabus" className="hover:underline">JEE Main syllabus</Link>), { label: p.name }]} />
      <H1>JEE Main {p.course} syllabus <span className="text-foreground/60">2026 · {p.name}</span></H1>
      <Lead paras={[`${p.name} has ${p.parts.length} parts: ${p.parts.map((x) => x.title.replace(/^Part [IV]+: /, "").toLowerCase()).join(", ")}.`]} />
      <div className="mt-6 space-y-4">
        {p.parts.map((part) => (
          <section key={part.title} className="clay rounded-3xl p-5">
            <h2 className="font-display text-lg font-bold text-foreground">{part.title}</h2>
            <p className="mt-1 text-sm text-foreground/70">{part.summary}</p>
            {part.items && (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground/75">
                {part.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            {part.title.startsWith("Part I:") && (
              <ol className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {syllabusUnits("maths").map(({ unit, chapter }) => (
                  <li key={chapter.slug}>Unit {unit}: <ChapterLink c={chapter} /></li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm">
        Also see the <Link to="/jee/syllabus/$subject" params={{ subject: other.key }} className="font-bold text-[var(--sky-deep)]">{other.name} syllabus →</Link>
      </p>
      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={paper2Faq(p)} />
      <RelatedGuides exclude={["syllabus"]} />
      <p className="mt-8 text-xs leading-relaxed text-foreground/50">Paraphrased from the JEE Main 2026 syllabus published by NTA. Confirm the latest syllabus on the official NTA website.</p>
    </Page>
  );
}

// ── /jee/removed-chapters ───────────────────────────────────────────────────
export function RemovedView() {
  const subjects = getJeeSubjects().filter((s) => s.chapters.some((c) => c.retired));
  return (
    <Page>
      <Crumbs items={[{ label: "Removed chapters" }]} />
      <H1>JEE Main chapters <span className="text-foreground/60">not in the 2026 syllabus</span></H1>
      <Lead paras={removedIntro()} />
      {subjects.map((s) => {
        const rows = s.chapters.filter((c) => c.retired);
        return (
          <section key={s.key}>
            <SectionTitle>{s.name}: {rows.length} chapter{rows.length === 1 ? "" : "s"}</SectionTitle>
            <Card>
              <div className="overflow-x-auto" role="region" aria-label={`${s.name} chapters not in the syllabus`} tabIndex={0}>
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
                      <th scope="col" className="py-2 pr-3 font-semibold">Chapter</th>
                      {YEARS.map((y) => (
                        <th key={y} scope="col" className="px-1 py-2 text-center font-semibold">{y}</th>
                      ))}
                      <th scope="col" className="px-2 py-2 text-center font-semibold">Total</th>
                      <th scope="col" className="px-2 py-2 text-center font-semibold">Last asked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.slug} className="border-t border-foreground/10">
                        <th scope="row" className="py-2 pr-3 text-[13px] font-medium"><ChapterLink c={c} /></th>
                        {c.years.map((n, i) => (
                          <td key={i} className="px-1 py-2 text-center text-xs">{n > 0 ? <span className="font-bold text-foreground">{n}</span> : <span className="text-foreground/25">–</span>}</td>
                        ))}
                        <td className="px-2 py-2 text-center text-xs font-bold text-foreground">{c.total}</td>
                        <td className="px-2 py-2 text-center text-xs text-foreground/70">{removedByLastYear(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        );
      })}
      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={removedFaq()} />
      <RelatedGuides exclude={["removed"]} />
      <p className="mt-8 text-xs leading-relaxed text-foreground/50">{droppedChapters().length} chapters here are absent from NTA's JEE Main 2026 syllabus. Always check NTA's latest notice before skipping a chapter. {JEE_DATA_NOTE.split(" Because")[0]}</p>
    </Page>
  );
}

// ── /jee/high-weightage-chapters ────────────────────────────────────────────
export function HighWeightView() {
  const cov = coverage();
  const top = topJeeChaptersOverall(20);
  return (
    <Page>
      <Crumbs items={[{ label: "High-weightage chapters" }]} />
      <H1>High-weightage JEE Main chapters <span className="text-foreground/60">{JEE_RANGE}</span></H1>
      <Lead paras={highIntro()} />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {cov.map((c) => (
          <div key={c.subject.key} className="clay-inset rounded-2xl px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">{c.subject.name}</p>
            <p className="mt-1 text-sm text-foreground/80">
              {c.need.map((n) => (
                <span key={n.target} className="block"><strong className="text-foreground">{n.chapters}</strong> chapters → {n.target}%</span>
              ))}
            </p>
          </div>
        ))}
      </div>

      {cov.map((c) => (
        <section key={c.subject.key}>
          <SectionTitle>{c.subject.name}: chapters by share of questions</SectionTitle>
          <Card>
            <div className="overflow-x-auto" role="region" aria-label={`${c.subject.name} cumulative chapter share`} tabIndex={0}>
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-foreground/50">
                    <th scope="col" className="w-8 py-2 pr-2 font-semibold">#</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Chapter</th>
                    <th scope="col" className="px-2 py-2 text-center font-semibold">Share {RECENT_LABEL}</th>
                    <th scope="col" className="px-2 py-2 text-center font-semibold">Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r, i) => (
                    <tr key={r.chapter.slug} className="border-t border-foreground/10">
                      <td className="py-2 pr-2 text-xs text-foreground/40">{i + 1}</td>
                      <th scope="row" className="py-2 pr-3 text-[13px] font-medium"><ChapterLink c={r.chapter} /></th>
                      <td className="px-2 py-2 text-center text-xs text-foreground/70">{r.share}%</td>
                      <td className="px-2 py-2 text-center text-xs font-bold text-foreground">{r.cumulative}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ))}

      <SectionTitle>Top 20 chapters across the whole paper</SectionTitle>
      <Card>
        <ol className="space-y-2 text-sm">
          {top.map((c, i) => (
            <li key={c.subjectKey + c.slug} className="flex items-baseline gap-3">
              <span className="w-5 text-xs text-foreground/40">{i + 1}</span>
              <span className="flex-1"><ChapterLink c={c} showSubject /></span>
              <span className="shrink-0 text-xs font-bold text-foreground">{c.paperShare}% of paper</span>
            </li>
          ))}
        </ol>
      </Card>

      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={highFaq()} />
      <PracticeCta line="Start with the chapters that carry the most questions." />
      <RelatedGuides exclude={["high-weightage"]} />
      <DataNote />
    </Page>
  );
}

// ── /jee/chapter-trends ─────────────────────────────────────────────────────
export function TrendsView() {
  const m = movers();
  return (
    <Page>
      <Crumbs items={[{ label: "Chapter trends" }]} />
      <H1>JEE Main chapter trends <span className="text-foreground/60">rising and falling</span></H1>
      <Lead paras={trendsIntro()} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Rising" value={m.rising.length} hint={`chapters, ${RECENT_LABEL} vs ${EARLIER_LABEL}`} />
        <Stat label="Falling" value={m.falling.length} />
        <Stat label="Steady" value={jeeActiveChapters() - m.rising.length - m.falling.length} />
      </div>
      {m.byPerSubject.map(({ subject, rising, falling, steady }) => (
        <section key={subject.key}>
          <SectionTitle>{subject.name}: {rising.length} rising, {falling.length} falling, {steady} steady</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["Rising", rising], ["Falling", falling]] as const).map(([label, items]) => (
              <div key={label} className="clay rounded-3xl p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/50">{label}</p>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground/50">None clearly {label.toLowerCase()}.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {items.map((x) => (
                      <li key={x.chapter.slug} className="flex items-baseline justify-between gap-3">
                        <ChapterLink c={x.chapter} />
                        <span className="shrink-0 text-xs text-foreground/60">{x.chapter.earlierAvgShare}% → {x.chapter.recentAvgShare}% ({x.diff > 0 ? "+" : ""}{x.diff})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <SectionTitle>Frequently asked questions</SectionTitle>
      <FaqList faqs={trendsFaq()} />
      <PracticeCta line="See how rising chapters are actually tested." />
      <RelatedGuides exclude={["trends"]} />
      <DataNote />
    </Page>
  );
}
