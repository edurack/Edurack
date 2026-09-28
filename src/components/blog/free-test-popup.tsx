// src/components/blog/free-test-popup.tsx
//
// "Free test series is available" nudge for blog pages. Mounted on the blog
// index and on every post; the audience (jee / neet / general) decides which
// admin-configured link and copy it shows. It appears BLOG_PROMO_DELAY_MS
// (10s) after the page loads — the timer starts on mount, so navigating to
// another post starts a fresh 10 seconds.
//
// Once a reader closes it or taps the button it stays away for the rest of
// that browser session (sessionStorage), so someone reading three posts in a
// row isn't interrupted three times. To change that to "every page load", drop
// the isDismissed() check and the markDismissed() calls.
import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  IconRocket as Rocket,
  IconX as X,
  IconCheck as Check,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { getBlogPromoPopup } from "@/server-functions/blog-public";
import { BLOG_PROMO_DELAY_MS } from "@/lib/blog-types";
import type { BlogPromoAudience, BlogPromoConfig } from "@/lib/blog-types";

const storageKey = (audience: BlogPromoAudience) => `edurack-blog-promo-dismissed-${audience}`;

function isDismissed(audience: BlogPromoAudience): boolean {
  try {
    return sessionStorage.getItem(storageKey(audience)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(audience: BlogPromoAudience) {
  try {
    sessionStorage.setItem(storageKey(audience), "1");
  } catch {
    /* storage blocked — the popup just won't be remembered */
  }
}

const AUDIENCE_TAG: Record<BlogPromoAudience, string | null> = { jee: "JEE", neet: "NEET", general: null };

const PERKS = [
  "Real exam-style CBT interface",
  "Instant score with question-wise analysis",
  "100% free — no payment, no card",
];

export function FreeTestPopup({ audience }: { audience: BlogPromoAudience }) {
  const [promo, setPromo] = useState<BlogPromoConfig | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    setPromo(null);
    setTimeUp(false);
    setClosed(false);
    if (isDismissed(audience)) return;

    let cancelled = false;
    // Fetch during the 10s wait so the popup can appear the instant the
    // timer ends, without a network round-trip at that moment.
    getBlogPromoPopup({ data: { audience } })
      .then((r) => {
        if (!cancelled) setPromo(r.popup);
      })
      .catch(() => {});
    const timer = window.setTimeout(() => {
      if (!cancelled) setTimeUp(true);
    }, BLOG_PROMO_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [audience]);

  if (!promo) return null;
  const open = timeUp && !closed;
  const external = /^https?:\/\//i.test(promo.url);
  const tag = AUDIENCE_TAG[audience];

  function dismiss() {
    markDismissed(audience);
    setClosed(true);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#080d1a]/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.75rem] border border-border bg-card text-card-foreground shadow-2xl shadow-black/40 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none"
        >
          {/* ── header: brand gradient with soft shapes ── */}
          <div className="relative overflow-hidden bg-[linear-gradient(135deg,#2864d7_0%,#1c46a8_55%,#141b2b_100%)] px-6 pb-7 pt-7 text-white">
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/[0.07]" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "18px 18px" }}
            />

            <DialogPrimitive.Close
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>

            <div className="relative flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#1c46a8]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Free
              </span>
              {tag && (
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                  {tag}
                </span>
              )}
            </div>

            <div className="relative mt-5 flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Rocket className="h-7 w-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="font-display text-2xl font-extrabold leading-tight tracking-tight">
                  {promo.title}
                </DialogPrimitive.Title>
              </div>
            </div>
            <DialogPrimitive.Description className="relative mt-3 text-sm leading-relaxed text-white/80">
              {promo.message}
            </DialogPrimitive.Description>
          </div>

          {/* ── body: perks + call to action ── */}
          <div className="px-6 pb-6 pt-5">
            <ul className="space-y-2.5">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-sm font-medium text-foreground/80">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>

            <a
              href={promo.url}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={dismiss}
              className="promo-shine group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#2864d7] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#2864d7]/30 transition hover:bg-[#1f52b3] active:scale-[0.99]"
            >
              {promo.buttonLabel}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              {external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>

            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full rounded-full py-2 text-xs font-semibold text-foreground/50 transition hover:text-foreground/80"
            >
              Maybe later
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
