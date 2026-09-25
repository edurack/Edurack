import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { SiteHeader, SiteFooter, WRAP, Rise } from "@/components/landing/site-chrome";

interface LegalLayoutProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the /legal/* route suite (terms, privacy, refund).
 * Uses the exact same sticky header, scroll-reveal and footer as the
 * homepage and every other secondary page, so these documents don't feel
 * like they've been dropped outside the rest of the site.
 */
export function LegalLayout({ icon: Icon, eyebrow, title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="py-14 sm:py-16">
          <div className={WRAP}>
            <Rise className="mx-auto max-w-3xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary sm:text-sm">
                <Icon className="h-4 w-4" />
                {eyebrow}
              </div>
              <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
                <span className="block font-extrabold">{title}</span>
              </h1>
              <p className="mt-3 text-xs font-medium text-muted-foreground">Last updated: {lastUpdated}</p>
            </Rise>

            <Rise delay={0.1} className="mx-auto mt-10 max-w-3xl">
              <div className="clay p-6 sm:p-10">
                <div className="space-y-8 text-sm leading-relaxed text-foreground/80">{children}</div>
              </div>

              <div className="mt-8 text-center text-xs text-muted-foreground">
                Questions about these terms?{" "}
                <Link to="/contact" className="font-semibold text-foreground hover:underline">
                  Contact our team
                </Link>
                .
              </div>
            </Rise>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base font-bold text-foreground sm:text-lg">{title}</h2>
      <div className="mt-2.5 space-y-2.5 text-muted-foreground">{children}</div>
    </section>
  );
}