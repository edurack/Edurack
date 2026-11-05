// Shown at the top of the dashboard while a student's Edurack Pro is active: it says plainly that the plan is on,
// how long it runs, what it unlocked, and gives two ways to start solving right now (a mock drill of their own, or a PYQ).
// It also carries the "NCERT Line by Line will be completely free for Pro students" notice, which the student can close.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Flame, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PRO_FEATURES } from "@/lib/pro";
import type { DrillAccess } from "@/lib/pro";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;
const NOTICE_KEY = "ncert-line-by-line-free";
const noticeStorageKey = (uid: string) => `edurack-notice:${NOTICE_KEY}:${uid}`;
const noticeClosed = (uid: string) => {
  try {
    return localStorage.getItem(noticeStorageKey(uid)) === "1";
  } catch {
    return false;
  }
};

export function ProActiveCard({ access, className }: { access: DrillAccess | null; className?: string }) {
  const { user } = useAuth();
  const [closed, setClosed] = useState(false);
  if (!access?.isPro || !access.proUntil) return null;

  const until = new Date(access.proUntil);
  const daysLeft = Math.max(0, Math.ceil((until.getTime() - Date.now()) / DAY_MS));
  const untilLabel = until.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const showNotice = !!user && !closed && !noticeClosed(user.uid);

  function closeNotice() {
    setClosed(true);
    try {
      if (user) localStorage.setItem(noticeStorageKey(user.uid), "1");
    } catch {
      /* storage unavailable: the notice may come back next visit, harmless */
    }
  }

  return (
    <section aria-label="Your Edurack Pro plan" data-testid="pro-active-card" className={cn("min-w-0 rounded-3xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-300/30 dark:bg-amber-300/10 sm:p-5", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300 text-amber-950">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-800 dark:text-amber-200">Edurack Pro is active</p>
            <h2 className="font-display mt-0.5 text-lg font-extrabold leading-snug tracking-tight text-foreground sm:text-xl">{daysLeft <= 1 ? "Your last day of Pro. Make it count." : `${daysLeft} days of Pro left. Put them to work.`}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Active until {untilLabel}. Solve a few questions today and keep your streak alive.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link to="/pyq-drill" search={{ src: "dashboard", build: true }} data-testid="pro-build-drill" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 motion-reduce:transition-none">
            <Flame className="h-4 w-4" aria-hidden /> Build a mock drill
          </Link>
          <Link to="/pyq" search={{}} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold text-foreground/80 hover:bg-foreground/5">
            Solve a PYQ now <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {access.features.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {access.features.map((k) => (
            <li key={k} className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-foreground/80 dark:bg-white/10">
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-300" aria-hidden /> {PRO_FEATURES[k].label}
            </li>
          ))}
        </ul>
      )}

      {showNotice && (
        <div role="status" data-testid="ncert-free-notice" className="mt-4 flex items-start gap-3 rounded-2xl bg-white/80 p-3.5 dark:bg-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-foreground">NCERT Line by Line is coming, completely free for you</p>
            <p className="mt-0.5 text-xs text-muted-foreground">As a Pro student you won't pay anything extra for it when it opens.</p>
          </div>
          <button type="button" onClick={closeNotice} aria-label="Close this notice" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/50 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
