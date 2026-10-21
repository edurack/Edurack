// src/components/jee/jee-related.tsx — cross-links between the JEE guides, so no page is a dead end.
import { Link } from "@tanstack/react-router";

const GUIDES = [
  { id: "weightage", to: "/jee/chapter-wise-weightage", title: "Chapter-wise weightage", desc: "Every chapter ranked by share of questions." },
  { id: "syllabus", to: "/jee/syllabus", title: "JEE Main syllabus 2026", desc: "Unit-wise topics for Paper 1, 2A and 2B." },
  { id: "paper-analysis", to: "/jee/paper-analysis", title: "Paper analysis by year", desc: "What each year's papers asked, chapter by chapter." },
  { id: "high-weightage", to: "/jee/high-weightage-chapters", title: "High-weightage chapters", desc: "How few chapters cover most of the paper." },
  { id: "trends", to: "/jee/chapter-trends", title: "Rising and falling chapters", desc: "Which chapters are gaining or losing share." },
  { id: "removed", to: "/jee/removed-chapters", title: "Removed chapters", desc: "Chapters not in the 2026 syllabus." },
  { id: "concepts", to: "/jee/most-repeated-concepts", title: "Most repeated concepts", desc: "The concepts JEE Main asks most." },
] as const;

export type GuideId = (typeof GUIDES)[number]["id"];

export function RelatedGuides({ exclude = [] as GuideId[], limit = 6 }: { exclude?: GuideId[]; limit?: number }) {
  const items = GUIDES.filter((g) => !exclude.includes(g.id)).slice(0, limit);
  return (
    <section aria-labelledby="more-jee-guides">
      <h2 id="more-jee-guides" className="mb-3 mt-10 font-display text-xl font-bold tracking-tight text-foreground">
        More JEE Main guides
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <Link key={g.id} to={g.to} className="clay block rounded-2xl p-4 transition hover:-translate-y-0.5">
            <p className="font-semibold text-foreground">{g.title}</p>
            <p className="mt-0.5 text-xs text-foreground/60">{g.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
