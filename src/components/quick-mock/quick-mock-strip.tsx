// A one-line Quick Mock nudge for places where a big banner would be too much: the chapter list, the end-of-practice
// screen and the PYQ landing pages. It links to the same /pyq-drill engine as every other entry point.
import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { DRILL_MINUTES, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import { quickMockName, quickMockSearch, type QuickMockSource } from "@/lib/quick-mock";
import { trackQuickMockClick, useQuickMockViewed } from "@/lib/quick-mock-analytics";
import { useAuth } from "@/lib/auth-context";

export function QuickMockStrip({ source, exam, lead, className }: { source: QuickMockSource; exam?: string | null; /** Short line before the button, e.g. "Done with this chapter?" */ lead?: string; className?: string }) {
  const { user } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  useQuickMockViewed(ref, source, {}, true);
  const name = quickMockName(exam);
  const onClick = () => trackQuickMockClick(source, { signed_in: Boolean(user) });
  // A visitor who isn't signed in goes to sign-up first and comes straight back to the Quick Mock afterwards.
  const link = user ? (
    <Link to="/pyq-drill" search={quickMockSearch({ src: source })} onClick={onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 text-sm font-bold text-primary hover:underline">
      Take a Quick Mock <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  ) : (
    <Link to="/auth" search={{ tab: "signup", redirect: `/pyq-drill?src=${source}` }} onClick={onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 text-sm font-bold text-primary hover:underline">
      Take a Quick Mock <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
  return (
    <div ref={ref} data-testid="quick-mock-strip" className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-border bg-card px-4 py-2.5", className)}>
      <p className="flex min-w-0 items-center gap-2.5 text-sm text-foreground/80">
        <Timer className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0"><b className="text-foreground">{name}</b> · {DRILL_QUESTIONS} PYQs · {DRILL_MINUTES} min{lead ? ` · ${lead}` : ""}</span>
      </p>
      {link}
    </div>
  );
}
