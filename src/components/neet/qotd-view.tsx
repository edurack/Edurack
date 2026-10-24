// /neet/question-of-the-day: today's NEET PYQ, public. The question is in the HTML; anyone can check the answer
// (rate-limited by the same endpoint as /question/$id); the written solution and streak need an account.
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Flame } from "lucide-react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { ShareButton } from "@/components/tools/tool-shell";
import { SmartContent } from "@/lib/smart-content";
import { QuickMockStrip } from "@/components/quick-mock/quick-mock-strip";
import { checkPublicPyqAnswer } from "@/server-functions/pyq-public";
import type { QotdPayload } from "@/lib/pyq-seo-server";
import type { PublicCheckResult } from "@/lib/pyq-public";
import type { OptionKey } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";

const OPTS: OptionKey[] = ["A", "B", "C", "D"];

export function prettyDay(day: string) {
  return new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function QotdView({ data }: { data: QotdPayload | null }) {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
          <Link to="/" className="hover:underline">Home</Link><span aria-hidden>/</span>
          <span className="font-semibold text-foreground/80">NEET question of the day</span>
        </nav>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">NEET question of the day</h1>
        {data ? <Body key={data.page.question.id} data={data} /> : (
          <p className="mt-6 text-[15px] text-foreground/70">Today's question isn't ready yet. <Link to="/pyq" className="font-bold underline">Practise NEET PYQs</Link> in the meantime.</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function Body({ data }: { data: QotdPayload }) {
  const { page, day, earlier } = data;
  const q = page.question;
  const [pick, setPick] = useState<OptionKey | null>(null);
  const [num, setNum] = useState("");
  const [res, setRes] = useState<PublicCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const can = q.type === "mcq" ? pick !== null : num.trim() !== "" && Number.isFinite(Number(num));

  async function check(reveal = false) {
    setBusy(true);
    setErr(null);
    try {
      const answer = reveal ? null : q.type === "mcq" ? { option: pick ?? undefined } : { value: Number(num) };
      setRes(await checkPublicPyqAnswer({ data: { questionId: q.id, answer } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't check that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-foreground/65">
        <Flame className="h-4 w-4 text-amber-500" aria-hidden />
        {prettyDay(day)} · one NEET PYQ a day, the same for every student
      </p>

      <article className="clay mt-6 rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-foreground/60">
          <span className="rounded-full bg-secondary px-2.5 py-1">{q.subject}</span>
          {q.chapter && <span className="rounded-full bg-secondary px-2.5 py-1">{q.chapter}</span>}
          {q.source?.label && <span className="rounded-full bg-secondary px-2.5 py-1 uppercase">{q.source.label}</span>}
        </div>
        <SmartContent value={q.body} className="mt-4 text-base leading-relaxed text-foreground" />

        {q.type === "mcq" && q.options ? (
          <ul className="mt-4 space-y-2">
            {OPTS.map((k) => {
              const right = res?.correctOption === k;
              const wrongPick = res && !res.revealed && pick === k && !res.isCorrect;
              return (
                <li key={k}>
                  <button type="button" disabled={!!res || busy} onClick={() => setPick(k)}
                    className={cn("flex min-h-12 w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors",
                      right ? "border-emerald-500 bg-emerald-500/10" : wrongPick ? "border-rose-500 bg-rose-500/10" : pick === k ? "border-primary bg-primary/10" : "border-border hover:border-foreground/40")}>
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold", pick === k || right ? "bg-primary text-primary-foreground" : "bg-secondary")}>{k}</span>
                    <SmartContent value={q.options![k]} className="min-w-0 flex-1" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <input inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} disabled={!!res || busy} placeholder="Type your numeric answer"
            className="mt-4 min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none" />
        )}

        {err && <p className="mt-3 text-xs font-semibold text-rose-600">{err}</p>}

        {res ? (
          <div className="mt-5 space-y-3" aria-live="polite">
            <p className={cn("text-base font-extrabold", res.revealed ? "text-foreground" : res.isCorrect ? "text-emerald-600" : "text-rose-600")}>
              {res.revealed ? "Here's the answer" : res.isCorrect ? "Correct!" : "Not quite"}
              {q.type === "mcq" ? ` · Correct option: ${res.correctOption}` : ` · Answer: ${res.correctAnswer}`}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to="/question/$id" params={{ id: page.canonical }} className="clay-btn inline-flex min-h-11 items-center justify-center px-5 text-sm">
                {res.hasSolution ? "See the full solution" : "Open the question page"}
              </Link>
              <Link to="/pyq" search={{ exam: "neet" } as never} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-bold text-foreground/75 hover:border-foreground/40">Practise more PYQs</Link>
              <ShareButton text={`Try today's NEET question on Edurack (${prettyDay(day)}).`} className="justify-center" />
            </div>
            <p className="text-xs text-foreground/55">Log in to see the step-by-step solution and to keep a daily streak going.</p>
            <QuickMockStrip source="pyq_landing" exam="neet" lead="30 minutes, 20 PYQs" />
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={() => check(false)} disabled={!can || busy} className="clay-btn inline-flex min-h-12 items-center justify-center gap-2 px-6 text-sm disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Check my answer
            </button>
            <button type="button" onClick={() => check(true)} disabled={busy} className="min-h-11 rounded-full px-4 text-sm font-semibold text-foreground/60 hover:bg-secondary">Show answer</button>
          </div>
        )}
      </article>

      {earlier.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">Previous questions of the day</h2>
          <ul className="clay divide-y divide-border rounded-3xl text-sm">
            {earlier.map((e) => (
              <li key={e.day}>
                <Link to="/question/$id" params={{ id: e.param }} className="flex gap-3 px-5 py-3 hover:bg-secondary">
                  <span className="w-28 shrink-0 text-xs font-semibold text-foreground/50">{new Date(`${e.day}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground/80">{e.snippet}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">More from {q.chapter || q.subject}</h2>
          <ul className="clay divide-y divide-border rounded-3xl text-sm">
            {page.related.map((r) => (
              <li key={r.param}><Link to="/question/$id" params={{ id: r.param }} className="block px-5 py-3 text-foreground/80 hover:bg-secondary">{r.snippet}</Link></li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-8 text-xs text-foreground/50">See also: <Link to="/tools" className="underline">free NEET tools</Link> · <Link to="/neet/paper-analysis" className="underline">paper analysis</Link> · <Link to="/neet/most-repeated-topics" className="underline">most repeated topics</Link></p>
    </>
  );
}
