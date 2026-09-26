// src/components/blog/table-of-contents.tsx
//
// "On this page" navigation for a blog post, built from the headings
// extracted by blog-content.tsx. Two things make it accessible rather
// than just decorative:
//   1. It's a real <nav aria-label="Table of contents"> with an <ol>, so
//      it's announced as a navigation landmark and the position ("link 3
//      of 9") comes for free from screen readers.
//   2. Clicking an entry moves keyboard/screen-reader focus to the target
//      heading (not just the scroll position) by briefly making it
//      focusable — the same pattern recommended for in-page skip links.
//
// Exported as two presentational pieces sharing one hook, rather than one
// component that hides itself with CSS at different breakpoints, so the
// page layout can place the mobile disclosure inline in the reading flow
// and the desktop version in a separate sticky sidebar column:
//   - MobileTableOfContents  → native <details> disclosure, closed by default
//   - TableOfContentsSidebar → sticky, always-open sidebar list

import { useEffect, useState } from "react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import type { BlogHeading } from "@/lib/blog-content";

function useActiveHeading(headings: BlogHeading[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
          setActiveId(top.target.id);
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );

    const elements = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [headings]);

  return [activeId, setActiveId] as const;
}

function jumpToHeading(e: React.MouseEvent<HTMLAnchorElement>, id: string, setActiveId: (id: string) => void) {
  const target = document.getElementById(id);
  if (!target) return; // let the browser fall back to default anchor behaviour
  e.preventDefault();
  window.history.pushState(null, "", `#${id}`);
  target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  // Headings aren't focusable by default — grant it temporarily so
  // keyboard/screen-reader users land where sighted users land.
  const hadTabIndex = target.hasAttribute("tabindex");
  if (!hadTabIndex) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  if (!hadTabIndex) {
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  setActiveId(id);
}

function TocList({ headings, activeId, onJump }: { headings: BlogHeading[]; activeId: string | null; onJump: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void }) {
  return (
    <ol className="space-y-1 text-sm">
      {headings.map((h) => (
        <li key={h.id} className={h.level === 3 ? "ml-3" : ""}>
          <a
            href={`#${h.id}`}
            onClick={(e) => onJump(e, h.id)}
            aria-current={activeId === h.id ? "location" : undefined}
            className={`block rounded-lg px-2.5 py-1.5 leading-snug transition-colors ${
              activeId === h.id ? "bg-secondary font-semibold text-foreground" : "text-foreground/60 hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function MobileTableOfContents({ headings, className }: { headings: BlogHeading[]; className?: string }) {
  const [activeId, setActiveId] = useActiveHeading(headings);
  if (headings.length < 2) return null;

  function onJump(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    jumpToHeading(e, id, setActiveId);
  }

  return (
    <nav aria-label="Table of contents" className={className}>
      <details className="clay group p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between font-display text-sm font-bold text-foreground marker:content-none">
          Table of contents
          <ChevronDown className="h-4 w-4 text-foreground/50 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3">
          <TocList headings={headings} activeId={activeId} onJump={onJump} />
        </div>
      </details>
    </nav>
  );
}

export function TableOfContentsSidebar({ headings, className }: { headings: BlogHeading[]; className?: string }) {
  const [activeId, setActiveId] = useActiveHeading(headings);
  if (headings.length < 2) return null;

  function onJump(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    jumpToHeading(e, id, setActiveId);
  }

  return (
    <nav aria-label="Table of contents" className={className}>
      <div className="clay sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
        <p className="mb-3 font-display text-sm font-bold text-foreground">Table of contents</p>
        <TocList headings={headings} activeId={activeId} onJump={onJump} />
      </div>
    </nav>
  );
}
