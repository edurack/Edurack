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

export function ProActiveCard({ access, className, compact = false }: { access: DrillAccess | null; className?: string; /** One slim status row (used at the top of the dashboard) instead of the full card. */ compact?: boolean }) {
  const { user } = useAuth();
  const [closed, setClosed] = useState(false);
  if (!access?.isPro || !access.proUntil) return null;

  const until = new Date(access.proUntil);
  const daysLeft = Math.max(0, Math.ceil((until.getTime() - Date.now()) / DAY_MS));
  const untilLabel = until.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const showNotice = !!user && !closed && !noticeClosed(user.uid);

  if (compact) {
    return (
      <section aria-label="Your Edurack Pro plan" data-testid="pro-active-card" className={cn("flex min-h-11 items-center justify-between gap-3 rounded-full bg-amber-500/10 pl-4 pr-3", className)}>
        <p className="flex min-w-0 items-center gap-2 text-[13px]">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <span className="truncate">
            <span className="font-semibold text-foreground">Edurack Pro</span>
            <span className="text-foreground/70"> · {daysLeft <= 1 ? "last day" : `${daysLeft} days left`}</span>
          </span>
        </p>
        <Link to="/pyq-drill" search={{ src: "dashboard", build: true }} data-testid="pro-build-drill" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline">
          Mock drill <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Your Edurack Pro plan" data-testid="pro-active-card" className={cn("min-w-0 rounded-2xl border border-foreground/10 bg-amber-500/10 p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-200">Edurack Pro is active</p>
            <h2 className="font-display mt-1 text-lg font-bold leading-snug tracking-tight text-foreground">{daysLeft <= 1 ? "Your last day of Pro. Make it count." : `${daysLeft} days of Pro left. Put them to work.`}</h2>
            <p className="mt-1 text-[13px] text-foreground/70">Active until {untilLabel}. Solve a few questions today and keep your streak alive.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <Link to="/pyq-drill" search={{ src: "dashboard", build: true }} data-testid="pro-build-drill" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none">
            <Flame className="h-4 w-4" aria-hidden /> Build a mock drill
          </Link>
          <Link to="/pyq" search={{}} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-foreground/80 hover:bg-foreground/5">
            Solve a PYQ now <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {access.features.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5">
          {access.features.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/80">
              <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden /> {PRO_FEATURES[k].label}
            </li>
          ))}
        </ul>
      )}

      {showNotice && (
        <div role="status" data-testid="ncert-free-notice" className="mt-5 flex items-start gap-3 border-t border-foreground/10 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">NCERT Line by Line is coming, completely free for you</p>
            <p className="mt-0.5 text-[13px] text-foreground/70">As a Pro student you won't pay anything extra for it when it opens.</p>
          </div>
          <button type="button" onClick={closeNotice} aria-label="Close this notice" className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
