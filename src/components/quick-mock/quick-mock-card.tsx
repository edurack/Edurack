// The dashboard's "NEET Quick Mock" card, next to chapter-wise PYQ practice. It reflects the student's real allowance
// (free one ready / used up / Pro-only / unfinished mock to resume) and leads to the same /pyq-drill engine.
import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { DRILL_MINUTES, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import { quickMockCopy, quickMockName, quickMockSearch, type QuickMockSource, type QuickMockStatus } from "@/lib/quick-mock";
import { trackQuickMockClick, useQuickMockViewed } from "@/lib/quick-mock-analytics";

export function QuickMockCard({ status, loaded, exam, source = "dashboard", className }: { status: QuickMockStatus; loaded: boolean; exam?: string | null; source?: QuickMockSource; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const copy = quickMockCopy(status);
  useQuickMockViewed(ref, source, { state: status.kind }, loaded);

  const search = quickMockSearch({ src: source, drillId: status.kind === "resume" ? status.drillId : undefined });
  const waiting = status.kind === "exhausted";

  return (
    <section ref={ref} aria-label={quickMockName(exam)} data-testid="quick-mock-card" className={cn("min-w-0 rounded-2xl border border-foreground/10 bg-card p-5", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"><Timer className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{quickMockName(exam)}</p>
            <p className="text-[13px] font-medium text-foreground/70">{DRILL_QUESTIONS} PYQs · {DRILL_MINUTES} Minutes</p>
            <p className={cn("font-display mt-1 font-bold leading-snug tracking-tight text-foreground", waiting ? "text-sm sm:text-base" : "text-lg sm:text-xl")}>{loaded || status.kind !== "unknown" ? copy.headline : "Checking your Quick Mock…"}</p>
            {copy.detail && !waiting && <p className="mt-0.5 text-[13px] text-foreground/70">{copy.detail}</p>}
          </div>
        </div>

        {waiting ? (
          <Link to="/pyq-drill" search={quickMockSearch({ src: source })} onClick={() => trackQuickMockClick(source, { state: "exhausted" })} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-foreground/15 px-5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40">
            Unlimited with Pro <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <Link to="/pyq-drill" search={search} onClick={() => trackQuickMockClick(source, { state: status.kind })} data-testid="quick-mock-cta" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none">
            {copy.cta} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
