// Homepage: "Got 30 Minutes? Test Your Preparation." Promotes the existing Quick Mock (the timed 20-PYQ drill, which serves the student's own exam).
// Signed-in students go straight to it; visitors sign up first and land on it right after (the auth page's redirect).
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight, IconClock as Clock, IconClipboardList as ListNumbers, IconTarget as PlusMinus } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { getPublicProOffer } from "@/server-functions/pro-public";
import { freeQuickMockOffered, quickMockSearch } from "@/lib/quick-mock";
import { trackQuickMockClick, useQuickMockViewed } from "@/lib/quick-mock-analytics";
import { DRILL_MARKS, DRILL_MINUTES, DRILL_QUESTIONS } from "@/lib/practice-schedule";
import { PREMIUM_BTN } from "@/components/landing/HeroMotion";

export function QuickMockSection() {
  const { user, loading } = useAuth();
  const ref = useRef<HTMLElement>(null);
  const [free, setFree] = useState(true);

  // Only say "free" when the free plan really includes a Quick Mock (it can be set to none while Pro is on sale).
  useEffect(() => {
    let alive = true;
    getPublicProOffer().then((o) => alive && setFree(freeQuickMockOffered(o))).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useQuickMockViewed(ref, "homepage", { signed_in: Boolean(user), free_offered: free }, !loading);
  const onClick = () => trackQuickMockClick("homepage", { signed_in: Boolean(user), free_offered: free });
  const label = free ? "Start Free Quick Mock" : "Try the Quick Mock";

  const facts = [
    { icon: ListNumbers, text: `${DRILL_QUESTIONS} Questions` },
    { icon: Clock, text: `${DRILL_MINUTES} Minutes` },
    { icon: PlusMinus, text: `+${DRILL_MARKS.correct}/${DRILL_MARKS.wrongMcq} Marking` },
  ];

  return (
    <section ref={ref} id="quick-mock" aria-labelledby="quick-mock-heading" className="border-y border-border bg-secondary/50 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary">Quick Mock</p>
          <h2 id="quick-mock-heading" className="font-display mt-3 text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Got 30 Minutes? Test Your Preparation.</h2>
          <p className="mt-3 text-balance text-base text-muted-foreground sm:text-lg">Take a free 20-question Quick Mock for your exam (NEET or JEE) with timed practice, instant scoring and detailed solutions.</p>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-2.5" aria-label="Quick Mock format">
            {facts.map((f) => (
              <li key={f.text} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold">
                <f.icon className="h-4 w-4 text-primary" aria-hidden />{f.text}
              </li>
            ))}
          </ul>

          <div className="mt-7">
            {user ? (
              <Link to="/pyq-drill" search={quickMockSearch({ src: "homepage" })} onClick={onClick} data-testid="homepage-quick-mock-cta" className={PREMIUM_BTN}>{label} <ArrowRight className="h-4 w-4" /></Link>
            ) : (
              <Link to="/auth" search={{ tab: "signup", redirect: "/pyq-drill?src=homepage" }} onClick={onClick} data-testid="homepage-quick-mock-cta" className={PREMIUM_BTN}>{label} <ArrowRight className="h-4 w-4" /></Link>
            )}
            {!user && !loading && <p className="mt-3 text-xs text-muted-foreground">Free account, no card. <Link to="/auth" search={{ tab: "signin", redirect: "/pyq-drill?src=homepage" }} className="font-bold text-primary hover:underline">Already have one? Log in</Link></p>}
          </div>
        </div>
      </div>
    </section>
  );
}
