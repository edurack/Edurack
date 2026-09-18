// Lightweight, dependency-free "product tour" — dims the page, cuts a
// spotlight around one element at a time (the classic box-shadow trick:
// a transparent box with a huge outward shadow floods everything OUTSIDE
// its own bounds, leaving the box's own area untouched), and shows a
// popover with Next/Back/Skip. No external library, no CDN script — safe
// to use in both the normal app and, if ever needed, a published
// artifact page.
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";

export type TourStep = {
  // CSS selector for the element to spotlight, e.g. '[data-tour="task-grid"]'.
  // If nothing matches, the step still shows as a centered popover over a
  // full-page dim — it degrades gracefully rather than breaking the tour.
  selector: string;
  title: string;
  description: string;
};

type Rect = { top: number; left: number; width: number; height: number };

// Tracks whether this tour has been seen before (localStorage, per
// storageKey) and exposes start()/finish() so a "Replay tour" button can
// relaunch it on demand even after it's been marked seen.
export function useTour(storageKey: string) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(storageKey)) setActive(true);
  }, [storageKey]);

  function start() {
    setActive(true);
  }
  function finish() {
    setActive(false);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, "1");
  }

  return { active, start, finish };
}

const POPOVER_WIDTH = 320;
const GAP = 12;
const PAD = 8;

export function OnboardingTour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[stepIndex];

  useLayoutEffect(() => {
    if (!step) return;

    function measure() {
      const el = document.querySelector(step.selector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    const el = document.querySelector(step.selector);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    measure();
    const settleTimer = window.setTimeout(measure, 320); // after scroll settles
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [stepIndex, step]);

  if (!step) return null;

  const highlightStyle: CSSProperties = rect
    ? {
        position: "fixed",
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: 20,
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
        pointerEvents: "none",
        transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
        zIndex: 100,
      }
    : { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.62)", zIndex: 100 };

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;

  const spaceBelow = rect ? viewportH - (rect.top + rect.height + PAD * 2) : viewportH;
  const placeBelow = !rect || spaceBelow > 200;

  const popoverTop = rect
    ? placeBelow
      ? rect.top + rect.height + PAD * 2 + GAP
      : Math.max(16, rect.top - PAD - GAP - 190)
    : viewportH / 2 - 100;
  const popoverLeft = rect
    ? Math.min(Math.max(16, rect.left), viewportW - POPOVER_WIDTH - 16)
    : viewportW / 2 - POPOVER_WIDTH / 2;

  return (
    <>
      <div style={highlightStyle} />
      <div
        className="clay fixed z-[101] p-5"
        style={{ top: popoverTop, left: popoverLeft, width: POPOVER_WIDTH }}
      >
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="font-display text-base font-bold text-foreground">{step.title}</h3>
        <p className="mt-1.5 text-sm text-foreground/70">{step.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onFinish} className="text-xs font-semibold text-foreground/40 hover:text-foreground/70">
            Skip
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex((i) => i - 1)}
                className="clay-chip rounded-full px-4 py-1.5 text-xs font-semibold text-foreground/70"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (stepIndex + 1 < steps.length ? setStepIndex((i) => i + 1) : onFinish())}
              className="clay-btn rounded-full px-4 py-1.5 text-xs font-bold text-white"
            >
              {stepIndex + 1 < steps.length ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}