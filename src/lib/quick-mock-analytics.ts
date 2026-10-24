// PostHog events for the Quick Mock funnel. Thin wrappers over lib/analytics so every entry point reports the same
// way, and so nothing is sent twice:
//   quick_mock_cta_viewed    the button was actually on screen (>= half visible), once per placement per page load
//   quick_mock_cta_clicked   the student tapped it (a double tap within 1.5 s is one click)
//   quick_mock_started       a NEW Quick Mock was created (resuming an unfinished one is not a start; see routes/pyq-drill)
//   quick_mock_completed     the Quick Mock was submitted, once per drill
//   quick_mock_upgrade_clicked  the student opened the Pro details or tapped a plan from the Quick Mock page
// Every event carries `source` (homepage | dashboard | sidebar | subject_practice | practice_results | pyq_landing |
// pyq_browse | direct). No personal data: ids and counts only.
import { useEffect, type RefObject } from "react";
import { track, trackOnce } from "@/lib/analytics";
import type { QuickMockSource } from "@/lib/quick-mock";

type Where = QuickMockSource | "direct";
const lastClick = new Map<string, number>();

export function trackQuickMockClick(source: Where, props: Record<string, string | number | boolean | null | undefined> = {}): void {
  const now = Date.now();
  if (now - (lastClick.get(source) ?? 0) < 1500) return;
  lastClick.set(source, now);
  track("quick_mock_cta_clicked", { source, ...props });
}

/** Fires quick_mock_cta_viewed once the element is at least half on screen. A placement that is never scrolled to is never "viewed". */
export function useQuickMockViewed(ref: RefObject<Element | null>, source: QuickMockSource, props: Record<string, string | number | boolean | null | undefined> = {}, enabled = true): void {
  const state = props.state;
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
          trackOnce(`qm-view:${source}`, "quick_mock_cta_viewed", { source, ...props });
          io.disconnect();
        }
      },
      { threshold: [0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, source, enabled, state]);
}
