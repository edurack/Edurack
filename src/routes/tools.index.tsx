// src/routes/tools.index.tsx  →  /tools
import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/neet-blueprint-copy";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { TOOLS } from "@/components/tools/tool-shell";

export const Route = createFileRoute("/tools/")({
  head: () =>
    pageHead({
      title: "Free NEET & JEE Tools: Rank, Percentile, Planner",
      description: "Free NEET and JEE tools: NEET rank predictor, percentile calculator, target score planner and a JEE Main percentile-to-rank calculator.",
      path: "/tools",
      jsonLd: [
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }]),
        itemListJsonLd("Free NEET and JEE tools", TOOLS.map((t) => ({ name: t.name, url: `${SITE_URL}${t.to}` }))),
      ],
    }),
  component: ToolsHub,
});

function ToolsHub() {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Free NEET and JEE tools</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/75">Quick calculators for NEET and JEE aspirants. The NEET tools use real marks-vs-rank data from the last three papers. No login needed.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <Link key={t.to} to={t.to} className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
              <span className="text-3xl">{t.emoji}</span>
              <h2 className="font-display mt-2 text-xl font-bold text-foreground">{t.name}</h2>
              <p className="mt-1 text-sm text-foreground/65">{t.blurb}</p>
            </Link>
          ))}
          <Link to="/neet/chapter-wise-weightage" className="clay block rounded-3xl p-5 transition hover:-translate-y-0.5">
            <span className="text-3xl">📚</span>
            <h2 className="font-display mt-2 text-xl font-bold text-foreground">Chapter-wise weightage</h2>
            <p className="mt-1 text-sm text-foreground/65">See which chapters carry the marks, paper by paper.</p>
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
