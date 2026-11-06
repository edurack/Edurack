// The ONE banner on the dashboard overview: NCERT Line by Line. It reads the same "can this student open it yet" answer the
// PYQ page uses (getNcertAccess), so it says "Coming soon" until the section is open for them, and links straight in when it is.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getNcertAccess } from "@/server-functions/ncert-line-practice";
import { cn } from "@/lib/utils";

export function NcertBanner({ className, isPro = false }: { className?: string; /** Pro students are told it will be free for them. */ isPro?: boolean }) {
  const { user } = useAuth();
  const [access, setAccess] = useState<{ enabled: boolean; mode: "beta" | "live" } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const a = await getNcertAccess({ data: { token: await user.getIdToken() } });
        if (!cancelled) setAccess(a);
      } catch {
        /* treat as not yet available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const enabled = Boolean(access?.enabled);
  const shell = cn("flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl bg-violet-500/10 px-5 py-4 text-left", className);
  const body = (
    <>
      <BookOpen className="h-6 w-6 shrink-0 text-violet-700 dark:text-violet-300" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">NCERT Line by Line</span>
        <span className="block text-[13px] text-foreground/70">{!enabled && isPro ? "Coming soon, and completely free for you as a Pro student" : "Topic-by-topic questions, straight from NCERT"}</span>
      </span>
      {enabled ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-foreground">
          {access?.mode === "beta" ? "Beta access" : "Open"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/70">{isPro ? "Free for Pro" : "Coming soon"}</span>
      )}
    </>
  );

  return enabled ? (
    <Link to="/pyq" search={{ ncert: true }} aria-label="NCERT Line by Line" data-testid="ncert-banner" className={cn(shell, "transition-colors hover:bg-violet-500/15 motion-reduce:transition-none")}>
      {body}
    </Link>
  ) : (
    <div aria-label="NCERT Line by Line, coming soon" data-testid="ncert-banner" className={shell}>
      {body}
    </div>
  );
}
