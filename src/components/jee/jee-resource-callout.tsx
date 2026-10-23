// src/components/jee/jee-resource-callout.tsx
//
// Entry-point card shown on the existing JEE weightage pages. Kept in its own file (it imports nothing from
// jee-views.tsx) so jee-views.tsx can use it without creating an import cycle.
import { Link } from "@tanstack/react-router";
import { getJeeChapter, getJeeSubject } from "@/lib/jee-blueprint";
import { JEE_LIBRARY_YEAR, JEE_LIB_BASE, jeeLibChapterPath, jeeLibSubjectPath, type JeeLibrarySummary } from "@/lib/jee-resource-types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Entry-point card for the existing JEE pages. Renders nothing unless something is actually published. ────────
export function JeeResourcesCallout({ summary, subjectKey, chapterSlug }: { summary?: JeeLibrarySummary | null; subjectKey?: string; chapterSlug?: string }) {
  if (!summary) return null;
  const subject = subjectKey ? getJeeSubject(subjectKey) : undefined;
  const chapter = subjectKey && chapterSlug ? getJeeChapter(subjectKey, chapterSlug) : undefined;
  const count = chapter ? summary.byChapter[`${subjectKey}/${chapterSlug}`] ?? 0 : subject ? summary.bySubject[subject.key] ?? 0 : summary.total;
  if (!count) return null;
  const to = chapter ? jeeLibChapterPath(subject!.key, chapter.slug) : subject ? jeeLibSubjectPath(subject.key) : JEE_LIB_BASE;
  const title = chapter ? `${chapter.name}: notes & practice sheets` : subject ? `JEE Main ${subject.name} notes & practice sheets` : `JEE Main ${JEE_LIBRARY_YEAR} notes & practice sheets`;
  return (
    <Link to={to as never} className="clay mt-8 flex flex-col gap-1 rounded-3xl p-5 transition hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between">
      <span>
        <span className="block font-display text-lg font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-foreground/60">{plural(count, "PDF resource")} from the Edurack team — notes, revision sheets, practice and solutions.</span>
      </span>
      <span className="mt-2 shrink-0 text-sm font-bold text-[var(--sky-deep)] sm:mt-0">View resources →</span>
    </Link>
  );
}
