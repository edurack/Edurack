// Shared frame for the free tools (/tools/*): header/footer, breadcrumb, intro, FAQ, links to the sibling tools.
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Check, Share2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import type { Faq } from "@/lib/neet-blueprint-copy";

export const TOOLS = [
  { to: "/tools/neet-rank-predictor", name: "NEET Rank Predictor", blurb: "Marks to expected AIR, using the last three years of NTA data.", emoji: "🎯" },
  { to: "/tools/neet-percentile-calculator", name: "NEET Percentile Calculator", blurb: "Turn your marks or rank into a percentile.", emoji: "📊" },
  { to: "/tools/neet-target-score-planner", name: "NEET Target Score Planner", blurb: "How many questions to attempt, and how accurately, for your target.", emoji: "🧭" },
  { to: "/tools/jee-main-percentile-calculator", name: "JEE Main Percentile to Rank", blurb: "Turn your NTA percentile into an expected AIR, and back.", emoji: "🧮" },
] as const;

export const inputCls =
  "min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-base font-semibold text-foreground focus:border-primary focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-foreground/55">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-foreground/50">{hint}</span>}
    </label>
  );
}

export function ShareButton({ text, className = "" }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "https://www.edurack.in/tools";
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title: "Edurack", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* user cancelled the share sheet */
    }
  }
  return (
    <button type="button" onClick={share} className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-xs font-bold text-foreground/70 hover:border-foreground/40 ${className}`}>
      {done ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {done ? "Link copied" : "Share result"}
    </button>
  );
}

export function ToolShell({ title, intro, faqs, current, children }: { title: string; intro: string; faqs: Faq[]; current: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
          <Link to="/" className="hover:underline">Home</Link>
          <span aria-hidden>/</span>
          <Link to="/tools" className="hover:underline">Free tools</Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-foreground/80">{title}</span>
        </nav>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/75">{intro}</p>

        <div className="mt-7">{children}</div>

        <section className="mt-12">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">Frequently asked questions</h2>
          <div className="space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className="clay-inset rounded-2xl px-4 py-3 open:pb-4">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">More free tools</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOOLS.filter((t) => t.to !== current).map((t) => (
              <Link key={t.to} to={t.to} className="clay flex items-start gap-3 rounded-3xl p-4 transition hover:-translate-y-0.5">
                <span className="text-2xl">{t.emoji}</span>
                <span><span className="block text-sm font-bold text-foreground">{t.name}</span><span className="block text-xs text-foreground/60">{t.blurb}</span></span>
              </Link>
            ))}
            <Link to="/neet/chapter-wise-weightage" className="clay flex items-start gap-3 rounded-3xl p-4 transition hover:-translate-y-0.5">
              <span className="text-2xl">📚</span>
              <span><span className="block text-sm font-bold text-foreground">Chapter-wise weightage</span><span className="block text-xs text-foreground/60">See which chapters carry the marks.</span></span>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/** Closing call-to-action that moves a visitor from a calculator into practice. */
export function PracticeCta({ line }: { line: string }) {
  return (
    <div className="ink-section mt-6 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display text-lg font-extrabold">{line}</p>
        <p className="mt-1 text-sm text-white/65">Free NEET PYQs with solutions. Try your first 5 without logging in.</p>
      </div>
      <Link to="/pyq" search={{ exam: "neet" } as never} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#ffffff] px-6 text-sm font-extrabold text-[#141b2b]">
        Practise NEET PYQs
      </Link>
    </div>
  );
}
