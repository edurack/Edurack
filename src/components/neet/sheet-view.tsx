// /neet/chapter-wise-weightage/<subject>/<chapter>/sheet: a printable 20-question practice sheet.
// "Save as PDF" is the browser's print dialog (print: styles hide the site chrome), so there is no PDF file to maintain.
// The answer key is the sign-up hook: only signed-in students can fetch it.
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Printer, Lock } from "lucide-react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { useAuth } from "@/lib/auth-context";
import { SmartContent } from "@/lib/smart-content";
import { getChapterSheetKey, type ChapterSheet } from "@/server-functions/pyq-seo";
import { getChapter, practiceSearch, chapterPath } from "@/lib/neet-blueprint";
import type { OptionKey } from "@/lib/pyq-types";

const OPTS: OptionKey[] = ["A", "B", "C", "D"];

export function SheetView({ subjectKey, slug, sheet }: { subjectKey: string; slug: string; sheet: ChapterSheet }) {
  const c = getChapter(subjectKey, slug)!;
  const { user } = useAuth();
  const [key, setKey] = useState<{ id: string; answer: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answerOf = (id: string) => key?.find((k) => k.id === id)?.answer;

  async function unlock() {
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      setKey(await getChapterSheetKey({ data: { token: await user.getIdToken(), subject: c.subjectName, chapter: c.name } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load the answer key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="print:hidden"><SiteHeader backLabel="Back to home" /></div>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14 print:max-w-none print:p-0">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55 print:hidden">
          <Link to="/" className="hover:underline">Home</Link><span aria-hidden>/</span>
          <Link to="/neet/chapter-wise-weightage" className="hover:underline">Chapter-wise weightage</Link><span aria-hidden>/</span>
          <a href={chapterPath(subjectKey, slug)} className="hover:underline">{c.name}</a><span aria-hidden>/</span>
          <span className="font-semibold text-foreground/80">Practice sheet</span>
        </nav>

        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">NEET {c.name} PYQ practice sheet</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground/75">
          {sheet.questions.length} previous-year NEET {c.subjectName} questions from {c.name}, newest papers first. {c.name} carries {c.total} of the {c.subjectName} questions in NEET 2020 to 2026,
          so this is a good place to test yourself after revising the chapter. Marking: +4 correct, −1 wrong.
        </p>

        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="clay-btn inline-flex min-h-11 items-center gap-2 px-5 text-sm"><Printer className="h-4 w-4" />Save as PDF / Print</button>
          <Link to="/pyq" search={practiceSearch(c.subjectName, c.name) as never} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-bold text-foreground/75 hover:border-foreground/40">Practise all {sheet.total} online</Link>
        </div>

        <ol className="mt-8 space-y-6">
          {sheet.questions.map((q, i) => (
            <li key={q.id} className="break-inside-avoid">
              <div className="flex gap-3">
                <span className="font-display text-lg font-bold text-foreground/50">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  {q.source?.label && <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-foreground/45">{q.source.label}</p>}
                  <SmartContent value={q.body} className="text-[15px] leading-relaxed text-foreground" />
                  {q.type === "mcq" && q.options ? (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {OPTS.map((k) => (
                        <li key={k} className="flex gap-2"><span className="w-5 shrink-0 font-bold text-foreground/55">({k})</span><SmartContent value={q.options![k]} className="min-w-0 flex-1" /></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs italic text-foreground/50">Numerical answer</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12 break-inside-avoid rounded-3xl border border-border p-5">
          <h2 className="font-display text-xl font-bold text-foreground">Answer key</h2>
          {key ? (
            <ol className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
              {sheet.questions.map((q, i) => <li key={q.id}><span className="text-foreground/50">{i + 1}.</span> <b>{answerOf(q.id) ?? "—"}</b></li>)}
            </ol>
          ) : user ? (
            <div className="mt-2 print:hidden">
              <p className="text-sm text-foreground/65">Check yourself once you've tried all {sheet.questions.length}.</p>
              <button type="button" onClick={unlock} disabled={busy} className="clay-btn mt-3 inline-flex min-h-11 items-center gap-2 px-5 text-sm disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Show answer key</button>
              {err && <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
            </div>
          ) : (
            <div className="mt-2 print:hidden">
              <p className="flex items-center gap-2 text-sm text-foreground/65"><Lock className="h-4 w-4" />The answer key and step-by-step solutions are free with an Edurack account.</p>
              <Link to="/login" className="clay-btn mt-3 inline-flex min-h-11 items-center px-5 text-sm">Log in to unlock</Link>
            </div>
          )}
        </section>
      </main>
      <div className="print:hidden"><SiteFooter /></div>
    </>
  );
}
