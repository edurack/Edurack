import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { Sparkles } from "lucide-react";
import { CUSTOM_DRILL_COUNTS, PRO_FEATURES, PRO_FEATURE_KEYS } from "@/lib/pro";
import { getPublicProOffer, type PublicProOffer } from "@/server-functions/pro-public";
import { bestValueId, rupees } from "@/components/pro/pro-plan-cards";

// A short Edurack Pro teaser for the homepage. The plans come from the same place the mock drill page reads them,
// so prices here can never drift from what checkout charges. The full comparison lives on /pro.
export function LandingProSection() {
  const [offer, setOffer] = useState<PublicProOffer | null>(null);

  useEffect(() => {
    let alive = true;
    getPublicProOffer()
      .then((o) => alive && setOffer(o))
      .catch(() => alive && setOffer({ gatingOn: false, freeLimit: 0, proOnly: {} as PublicProOffer["proOnly"], plans: [] }));
    return () => {
      alive = false;
    };
  }, []);

  // Nothing for sale (or still loading): show nothing rather than a section that promises a plan that isn't there.
  if (!offer || offer.plans.length === 0) return null;

  const features = PRO_FEATURE_KEYS.filter((k) => offer.proOnly[k]);
  const best = bestValueId(offer.plans);

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="ink-section grid gap-8 rounded-3xl p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Edurack Pro
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">Build the mock drill you actually need.</h2>
          <p className="mt-3 text-white/70">Choose the chapter, difficulty and paper years, then solve it in real timed CBT mode. Everything you use free today stays free.</p>

          {features.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm text-white/80">
              {features.map((k) => (
                <li key={k}>
                  <b className="text-white">{PRO_FEATURES[k].label}.</b> {PRO_FEATURES[k].description}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {offer.plans.map((p) => (
              <span key={p.id} className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85">
                {p.name} · {rupees(p.price)} / {p.durationDays} days{p.id === best ? " · Best value" : ""}
              </span>
            ))}
          </div>

          <Link to="/pro" className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-6 text-sm font-bold text-[#141b2b] transition hover:bg-white/90">
            See Pro plans
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* A picture of the builder, not the real thing: it shows what you get to choose. */}
        <div aria-hidden className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-white/50">Your custom drill (example)</p>
          <div className="mt-3 space-y-3 text-sm">
            {[
              ["Subject", "Physics"],
              ["Chapter", "Current Electricity"],
              ["Difficulty", "Medium + Hard"],
              ["Paper years", "2020 – 2026"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                <span className="text-white/60">{k}</span>
                <span className="font-semibold text-white">{v}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-white/60">Length</span>
              {CUSTOM_DRILL_COUNTS.map((n, i) => (
                <span key={n} className={`rounded-full px-3 py-1 text-xs font-bold ${i === 1 ? "bg-white text-[#141b2b]" : "border border-white/25 text-white/80"}`}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
