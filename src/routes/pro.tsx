import { createFileRoute, Link } from "@tanstack/react-router";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Sparkles } from "lucide-react";
import { SITE_URL, breadcrumbJsonLd, noindexHead, pageHead } from "@/lib/seo";
import { CUSTOM_DRILL_COUNTS, PRO_FEATURES, PRO_FEATURE_KEYS } from "@/lib/pro";
import { getPublicProOffer } from "@/server-functions/pro-public";
import { ProPlanCards, rupees } from "@/components/pro/pro-plan-cards";
import { SiteHeader, SiteFooter, WRAP } from "@/components/landing/site-chrome";

export const Route = createFileRoute("/pro")({
  // Server-side, so the plans and prices are in the HTML for search engines and for people on slow phones.
  loader: async () => {
    try {
      return { offer: await getPublicProOffer() };
    } catch {
      return { offer: null };
    }
  },
  head: ({ loaderData }) => {
    const offer = loaderData?.offer;
    // No published plan = nothing is for sale, so there's nothing for search engines to index.
    if (!offer || offer.plans.length === 0) return noindexHead("Edurack Pro");
    const prices = offer.plans.map((p) => p.price);
    return pageHead({
      title: "Edurack Pro: Custom NEET Mock Drills",
      path: "/pro",
      description: `Build your own timed NEET drill by chapter, topic, difficulty and paper year, with unlimited drills. Edurack Pro plans start at ${rupees(Math.min(...prices))}. Everything else on Edurack stays free.`,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Edurack Pro",
          description: "Unlimited timed PYQ drills and a custom drill builder for exam preparation.",
          url: `${SITE_URL}/pro`,
          brand: { "@type": "Brand", name: "Edurack" },
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: offer.plans.length,
            offers: offer.plans.map((p) => ({ "@type": "Offer", name: p.name, price: p.price, priceCurrency: "INR", url: `${SITE_URL}/pro`, availability: "https://schema.org/InStock" })),
          },
        },
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Edurack Pro", path: "/pro" },
        ]),
      ],
    });
  },
  component: ProPage,
});

function ProPage() {
  const { offer } = Route.useLoaderData();
  const plans = offer?.plans ?? [];
  const proOnly = offer?.proOnly;
  const proFeatures = proOnly ? PRO_FEATURE_KEYS.filter((k) => proOnly[k]) : [];
  const freeLimit = offer?.freeLimit ?? 0;

  const faqs: { q: string; a: string }[] = [
    { q: "What is free, and what is Pro?", a: `Everything you use free today stays free: practice, answers, solutions, the notebook and the standard timed drill${freeLimit > 0 ? ` (${freeLimit} a day)` : ""}. Pro adds ${proFeatures.map((k) => PRO_FEATURES[k].label.toLowerCase()).join(" and ") || "extra drill features"}.` },
    { q: "What can I choose in a custom drill?", a: `A chapter or topic, the difficulty, the paper years to draw questions from, and the length: ${CUSTOM_DRILL_COUNTS.join(", ")} questions.` },
    { q: "How long does a plan last, and what if I buy again?", a: "Each plan runs for a fixed number of days. If you buy while Pro is still active, the new period starts when the current one ends, so you never lose days." },
    { q: "What happens when Pro ends?", a: "You go back to the free plan. Nothing you practised or saved is deleted." },
    { q: "How do I pay?", a: "Checkout is handled by Razorpay. You choose a plan, pay in the Razorpay window, and Pro switches on as soon as the payment is confirmed." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="py-12 sm:py-16">
          <div className={WRAP}>
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground hover:underline">
                Home
              </Link>
              <span className="mx-1.5">›</span>
              <span className="font-semibold text-foreground">Edurack Pro</span>
            </nav>

            <div className="mt-5 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary sm:text-sm">
                <Sparkles className="h-4 w-4" aria-hidden />
                Edurack Pro
              </div>
              <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                <span className="block font-light">Build your own mock drill.</span>
                <span className="block font-extrabold">Practise exactly what you need.</span>
              </h1>
              <p className="mt-4 text-muted-foreground">
                Pick the chapter or topic, the difficulty, the paper years and how many questions, then solve it in real timed CBT mode. Pro also removes the daily cap on timed drills.
                Everything else on Edurack stays free.
              </p>
            </div>

            {proFeatures.length > 0 && (
              <ul className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
                {proFeatures.map((k) => (
                  <li key={k} className="rounded-2xl border border-border bg-card p-4">
                    <p className="font-display font-bold">{PRO_FEATURES[k].label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {PRO_FEATURES[k].description}
                      {k === "unlimitedDrills" ? (freeLimit === 0 ? " Not part of the free plan." : ` Free plan: ${freeLimit} a day.`) : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-12 font-display text-2xl font-extrabold tracking-tight">Choose a plan</h2>
            <div className="mt-5">
              {plans.length > 0 && proOnly ? (
                <ProPlanCards plans={plans} proOnly={proOnly} />
              ) : (
                <div className="rounded-3xl border border-dashed border-border p-8 text-center">
                  <p className="font-semibold">Pro plans aren't on sale right now</p>
                  <p className="mt-1 text-sm text-muted-foreground">Every drill feature is open to everyone for now. Jump in and practise.</p>
                  <Link to="/pyq" className="clay-btn mt-5 inline-flex min-h-11 items-center px-6 text-sm">
                    Start free PYQ practice
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-16 max-w-3xl">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Questions about Edurack Pro</h2>
              <div className="mt-5 space-y-3">
                {faqs.map((f) => (
                  <details key={f.q} className="group clay overflow-hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-display font-bold text-foreground sm:px-6">
                      {f.q}
                      <ChevronDown className="h-5 w-5 shrink-0 text-foreground/40 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
