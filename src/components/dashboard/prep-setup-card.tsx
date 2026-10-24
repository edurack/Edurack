// A slim, never-blocking card that asks only for the prep details the student hasn't given yet (exam, class/track,
// target year). Onboarding already saved exam + track for most students, so usually this is one row of year chips.
// Each tap saves straight away; "Not now" hides it for a week. It is a card in the page, not a modal, so it can't stand
// between a student and practice.
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { updatePrepInfo } from "@/server-functions/profile";
import { missingPrepFields, targetYearOptions, TRACKS, type PrepProfile } from "@/lib/prep-profile";
import { cn } from "@/lib/utils";

const SNOOZE_DAYS = 7;
const key = (uid: string) => `edurack-prep-setup-snooze:${uid}`;
const snoozed = (uid: string) => {
  try { return Number(localStorage.getItem(key(uid)) ?? 0) > Date.now(); } catch { return false; }
};
const snooze = (uid: string) => {
  try { localStorage.setItem(key(uid), String(Date.now() + SNOOZE_DAYS * 86_400_000)); } catch { /* storage unavailable: it may show again next visit */ }
};

const CHIP = "inline-flex min-h-10 items-center justify-center gap-1 rounded-full border px-4 text-xs font-bold transition-colors";

export function PrepSetupCard({ profile, deferYear = false, onSaved }: { profile: PrepProfile | null; /** New students: ask for exam/class now, the target year after their first question. */ deferYear?: boolean; onSaved: (next: Partial<PrepProfile>) => void }) {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const years = useMemo(() => targetYearOptions(), []);

  if (!user || !profile || hidden || snoozed(user.uid)) return null;
  const missing = missingPrepFields(profile).filter((f) => !(deferYear && f === "year"));
  if (missing.length === 0) return null;

  async function save(field: string, patch: { targetExam?: "neet" | "jee"; track?: "11th" | "12th" | "Dropper"; targetYear?: number }, local: Partial<PrepProfile>) {
    if (!user || busy) return;
    setBusy(field);
    setErr(null);
    try {
      await updatePrepInfo({ data: { token: await user.getIdToken(), ...patch } });
      onSaved(local);
    } catch {
      setErr("Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const chip = (active: boolean) => cn(CHIP, active ? "border-foreground bg-foreground text-background" : "border-border text-foreground/80 hover:border-foreground/40");

  return (
    <section aria-label="Finish your prep details" className="rounded-3xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">Tune your practice <span className="font-medium text-muted-foreground">· {missing.length === 1 ? "one tap" : `${missing.length} quick taps`}</span></p>
          <p className="mt-0.5 text-xs text-muted-foreground">So we recommend the right questions. You can change this later in Profile.</p>
        </div>
        <button type="button" onClick={() => { snooze(user.uid); setHidden(true); }} className="inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-secondary">Not now</button>
      </div>

      <div className="mt-3 space-y-3">
        {missing.includes("exam") && (
          <div role="radiogroup" aria-label="Target exam" className="flex flex-wrap items-center gap-2">
            <span className="w-full text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:w-24">Exam</span>
            {(["neet", "jee"] as const).map((e) => (
              <button key={e} type="button" role="radio" aria-checked={false} disabled={busy !== null} onClick={() => save("exam", { targetExam: e }, { targetExam: e })} className={chip(false)}>{e === "neet" ? "NEET" : "JEE"}</button>
            ))}
          </div>
        )}
        {missing.includes("track") && (
          <div role="radiogroup" aria-label="Current class" className="flex flex-wrap items-center gap-2">
            <span className="w-full text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:w-24">I am in</span>
            {TRACKS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={false} disabled={busy !== null} onClick={() => save("track", { track: t }, { track: t })} className={chip(false)}>{t}</button>
            ))}
          </div>
        )}
        {missing.includes("year") && (
          <div role="radiogroup" aria-label="Target year" className="flex flex-wrap items-center gap-2">
            <span className="w-full text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:w-24">Target year</span>
            {years.map((y) => (
              <button key={y} type="button" role="radio" aria-checked={profile.targetYear === y} disabled={busy !== null} onClick={() => save("year", { targetYear: y }, { targetYear: y })} className={chip(profile.targetYear === y)}>
                {profile.targetYear === y && <Check className="h-3.5 w-3.5" aria-hidden />}{y}
              </button>
            ))}
          </div>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
    </section>
  );
}
