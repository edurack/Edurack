import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { pageHead, breadcrumbJsonLd } from "@/lib/seo";
import { IconChevronDown as ChevronDown, IconHelpCircle as HelpCircle } from "@tabler/icons-react";
import { SiteHeader, SiteFooter, WRAP, Rise, Title } from "@/components/landing/site-chrome";

// Top-of-funnel questions — "should I even sign up" — as opposed to
// help.tsx, which is account/ticket support for people who already have.
// Every answer here is something we can actually stand behind today: no
// user counts, no "trusted by X students" — we're early and would rather
// say nothing than say something we'd have to walk back later.
const FAQS: { q: string; a: string }[] = [
  {
    q: "What exactly is Edurack?",
    a: "Edurack is a marketplace for exam preparation: a free CBT mock-test engine built to match the real NTA exam interface, plus mentor-led test series and mentorship batches for NEET, JEE, CUET and IPMAT. You can practice on the simulator without paying anything, and pay only for the specific batches or test series you choose.",
  },
  {
    q: "Is Edurack only for NEET?",
    a: "No. Edurack covers NEET, JEE, CUET and IPMAT today, on the same CBT engine and the same mentorship marketplace. Some of our earliest content leans NEET- and JEE-heavy simply because that's what we've published first — the platform itself isn't built around any single exam.",
  },
  {
    q: "How is the mock test different from other test series apps?",
    a: "Most mock tests are a PDF or a generic quiz layout. Edurack's simulator replicates the actual NTA computer-based-test screen — the palette, timer placement and question navigation — so the first time you see that interface isn't exam day. You can try it free, with no sign-up, at /simulator/live.",
  },
  {
    q: "Who are the mentors, and are their credentials real?",
    a: "Mentors are independent — they design, price and run their own batches; Edurack isn't the instructor of record for any batch. Every mentor is required to verify the exam rank, institution and credentials shown on their profile before they can publish a batch, and falsified credentials are grounds for removal from the platform.",
  },
  {
    q: "Is Edurack a new platform?",
    a: "Yes — Edurack is early and growing. We'd rather be upfront about that than overstate how established we are. What's live today — the CBT simulator, mentor batches, test-series analytics — works the way it's described on this site; we're building on it from here.",
  },
  {
    q: "What does a test series or mentorship batch cost?",
    a: "Pricing is set per batch by the mentor who runs it, not fixed platform-wide, so it varies. Each batch's page shows its exact price before you pay, and the free CBT demo at /simulator/live doesn't require payment or sign-up at all.",
  },
  {
    q: "What do I get in the analytics after a test?",
    a: "A subject- and topic-wise breakdown of every attempt, not just a final score — so you (and your mentor, if you're in a batch) can see which specific chapters are actually costing you marks, not just how you did overall.",
  },
  {
    q: "Can I get a refund if a batch isn't right for me?",
    a: "Refund eligibility depends on the batch and how much of it you've used — the full terms are on our Refund & Cancellation Policy page. Check that page, or ask us directly through Contact, before you purchase if you're unsure.",
  },
  {
    q: "Can I become a mentor on Edurack?",
    a: "Yes — mentors apply, get their credentials verified, and then set up and price their own batches. Details and the application are on our Become a Mentor page.",
  },
  {
    q: "How do I get help with a specific problem?",
    a: "For anything account-, payment- or batch-specific, our Help & Support page has more detailed answers and a support ticket form. For anything else, use Contact and we'll get back to you.",
  },
];

export const Route = createFileRoute("/faq")({
  head: () =>
    pageHead({
      title: "Frequently Asked Questions",
      path: "/faq",
      description:
        "Common questions about Edurack's CBT mock tests, mentor verification, pricing and refunds — for NEET, JEE, CUET and IPMAT.",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "FAQ", path: "/faq" },
        ]),
      ],
    }),
  component: FaqPage,
});

function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="py-16 sm:py-20">
          <div className={WRAP}>
            <Rise className="mx-auto max-w-2xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary sm:text-sm">
                <HelpCircle className="h-4 w-4" />
                FAQ
              </div>
              <div className="mt-6">
                <Title light="Questions people ask" bold="before they sign up." />
              </div>
              <p className="mt-4 text-muted-foreground">
                Straight answers, including the ones about who we are. For account or payment help once
                you're already using Edurack, see{" "}
                <Link to="/help" className="font-semibold text-foreground hover:underline">
                  Help &amp; Support
                </Link>{" "}
                instead.
              </p>
            </Rise>

            <Rise delay={0.1} className="mx-auto mt-10 max-w-3xl space-y-3">
              {FAQS.map((f, i) => {
                const isOpen = open === i;
                return (
                  <div key={f.q} className="clay overflow-hidden">
                    <button
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6 sm:py-5"
                      aria-expanded={isOpen}
                    >
                      <span className="font-display font-bold text-foreground">{f.q}</span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-foreground/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isOpen && (
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6">{f.a}</p>
                    )}
                  </div>
                );
              })}
            </Rise>

            <Rise delay={0.15} className="mx-auto mt-10 max-w-3xl text-center">
              <p className="text-sm text-muted-foreground">
                Didn't find what you needed?{" "}
                <Link to="/contact" className="font-semibold text-foreground hover:underline">
                  Talk to us
                </Link>
                , or read more{" "}
                <Link to="/about" className="font-semibold text-foreground hover:underline">
                  about Edurack
                </Link>
                .
              </p>
            </Rise>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
