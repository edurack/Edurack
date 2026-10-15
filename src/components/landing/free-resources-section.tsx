// Landing-page block for the open /free-resources library. Deliberately static (no data fetch):
// the links are plain, crawlable <Link>s, and the section costs nothing on first load.
import { Link } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight, IconDownload as Download, IconFileText as FileText, IconLockOpen as Unlock } from "@tabler/icons-react";
import { GHOST_BTN } from "@/components/landing/HeroMotion";
import { Rise, Title, WRAP } from "@/components/landing/site-chrome";

const EXAMS: { key: "neet" | "jee" | "cuet" | "ipmat"; label: string; blurb: string }[] = [
  { key: "neet", label: "NEET", blurb: "Biology, Physics & Chemistry notes, PYQ papers and formula sheets." },
  { key: "jee", label: "JEE", blurb: "Chapter notes, previous year papers and quick-revision sheets." },
  { key: "cuet", label: "CUET", blurb: "Domain-subject and General Test study material." },
  { key: "ipmat", label: "IPMAT", blurb: "Quant and verbal practice material and planners." },
];

export function FreeResourcesSection() {
  return (
    <section id="free-resources" aria-labelledby="free-resources-title" className="py-20 sm:py-28">
      <div className={WRAP}>
        <Rise className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> No login needed
            </span>
            <div id="free-resources-title" className="mt-4">
              <Title light="Free notes & PDFs," bold="for every aspirant." />
            </div>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Download notes, previous year papers, formula sheets and planners for NEET, JEE, CUET and IPMAT. Open to everyone, free.
            </p>
          </div>
          <Link to="/free-resources" preload="viewport" className={`${GHOST_BTN} shrink-0`}>
            Browse all resources <ArrowRight className="h-4 w-4" />
          </Link>
        </Rise>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXAMS.map((e, i) => (
            <li key={e.key} className="list-none">
              <Rise delay={i * 0.07} className="h-full">
                <Link
                  to="/free-resources"
                  search={{ exam: e.key }}
                  className="group flex h-full flex-col rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 font-display text-lg font-bold">Free {e.label} resources</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{e.blurb}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-bold text-foreground">
                    <Download className="h-4 w-4" aria-hidden="true" /> Download <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              </Rise>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
