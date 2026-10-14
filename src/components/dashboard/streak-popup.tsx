// Shown once per login session when the student hasn't practised today (no streak progress yet).
// It carries today's daily PYQ so they can answer right there, which counts toward the streak
// through the same submitPyqAnswer call the PYQ page uses.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, Check, X as XIcon, ArrowRight } from "lucide-react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { SmartContent } from "@/lib/smart-content";
import { getTodaySummary, listPyqSession } from "@/server-functions/practice-extras";
import { submitPyqAnswer } from "@/server-functions/pyq-practice";
import type { OptionKey, PyqCheckResult, PyqQuestion, TodaySummary } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";

const OPTS: OptionKey[] = ["A", "B", "C", "D"];
const dayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function seenKey(uid: string) {
  return `edurack-streak-popup:${uid}:${dayKey()}`;
}
function markSeen(uid: string) {
  try { sessionStorage.setItem(seenKey(uid), "1"); } catch { /* storage unavailable: popup may show again, harmless */ }
}
function wasSeen(uid: string) {
  try { return sessionStorage.getItem(seenKey(uid)) === "1"; } catch { return false; }
}

export function StreakPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [q, setQ] = useState<PyqQuestion | null>(null);
  const [pick, setPick] = useState<OptionKey | null>(null);
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PyqCheckResult | null>(null);

  useEffect(() => {
    if (!user || wasSeen(user.uid)) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const t = await getTodaySummary({ data: { token } });
        if (cancelled || t.streak.doneToday || !t.daily.available || t.daily.done) return;
        const list = await listPyqSession({ data: { token, kind: "daily" } });
        const first = list.questions[0];
        if (cancelled || !first) return;
        setToday(t);
        setQ(first);
        setOpen(true);
        markSeen(user.uid); // once per login session: refreshing or navigating back won't nag again
      } catch {
        /* the popup is a nudge, never an error */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function submit() {
    if (!user || !q) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const answer = q.type === "mcq" ? { option: pick ?? undefined } : { value: Number(num) };
      setResult(await submitPyqAnswer({ data: { token, questionId: q.id, answer } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't check that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!q) return null;
  const atRisk = (today?.streak.current ?? 0) > 0;
  const canSubmit = q.type === "mcq" ? pick !== null : num.trim() !== "" && Number.isFinite(Number(num));
  const newStreak = result?.streak?.current;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-y-auto rounded-3xl border-0 p-0 [&>button]:text-white">
        <div className="ink-section relative isolate overflow-hidden px-5 pb-5 pt-6 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" />
          {result ? (
            <div className="animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center gap-3">
                <span className={cn("grid h-12 w-12 place-items-center rounded-2xl", result.isCorrect ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950")}>
                  {result.isCorrect ? <Check className="h-6 w-6" strokeWidth={3} /> : <XIcon className="h-6 w-6" strokeWidth={3} />}
                </span>
                <div>
                  <DialogTitle className="font-display text-xl font-extrabold text-white">{result.isCorrect ? "Correct!" : "Not quite, and that's fine"}</DialogTitle>
                  <DialogDescription className="text-sm text-white/65">
                    {newStreak ? `🔥 ${newStreak}-day streak${result.streak?.increased ? " and growing" : ""}` : "Your streak is safe for today."}
                  </DialogDescription>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-300 text-amber-950"><Flame className="h-5 w-5 fill-current" aria-hidden /></span>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-200">{atRisk ? `Keep your ${today!.streak.current}-day streak` : "Start your streak"}</p>
              </div>
              <DialogTitle className="font-display mt-3 text-2xl font-extrabold leading-tight text-white">
                {atRisk ? "One question keeps it alive" : "Solve one question to begin"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-white/65">Today's PYQ. Takes about two minutes, and you'll see the full solution.</DialogDescription>
            </>
          )}
        </div>

        <div className="space-y-4 bg-card px-5 pb-5 pt-4 text-foreground sm:px-6">
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-muted-foreground">
            <span className="rounded-full bg-secondary px-2.5 py-1">{q.subject}</span>
            {q.chapter && <span className="rounded-full bg-secondary px-2.5 py-1">{q.chapter}</span>}
            {q.source?.year && <span className="rounded-full bg-secondary px-2.5 py-1">{q.source.year}</span>}
          </div>
          <SmartContent value={q.body} className="text-[15px] leading-relaxed" />

          {q.type === "mcq" && q.options ? (
            <ul className="space-y-2">
              {OPTS.map((k) => {
                const isPick = pick === k;
                const isRight = result && result.correctOption === k;
                const isWrongPick = result && isPick && !result.isCorrect;
                return (
                  <li key={k}>
                    <button
                      type="button" disabled={!!result || busy} onClick={() => setPick(k)}
                      className={cn(
                        "flex min-h-12 w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors",
                        isRight ? "border-emerald-500 bg-emerald-500/10" : isWrongPick ? "border-rose-500 bg-rose-500/10" : isPick ? "border-primary bg-primary/10" : "border-border hover:border-foreground/40",
                      )}
                    >
                      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold", isPick || isRight ? "bg-primary text-primary-foreground" : "bg-secondary")}>{k}</span>
                      <SmartContent value={q.options![k]} className="min-w-0 flex-1" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <input
              inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} disabled={!!result || busy} placeholder="Type your numeric answer"
              className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none"
            />
          )}

          {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}

          {result ? (
            <div className="space-y-3 animate-in fade-in duration-300">
              {result.solution && (
                <div className="rounded-2xl bg-secondary p-4">
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Solution</p>
                  <SmartContent value={result.solution} className="text-sm leading-relaxed" />
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to="/pyq" search={{ practice: true } as never} onClick={() => setOpen(false)} className="clay-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-5 text-sm">
                  Keep practising <ArrowRight className="h-4 w-4" />
                </Link>
                <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5 text-sm font-bold text-muted-foreground hover:bg-secondary">Done for now</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button type="button" onClick={submit} disabled={!canSubmit || busy} className="clay-btn inline-flex min-h-12 flex-1 items-center justify-center gap-2 px-5 text-sm disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Check my answer
              </button>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5 text-sm font-semibold text-muted-foreground hover:bg-secondary">Maybe later</button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
