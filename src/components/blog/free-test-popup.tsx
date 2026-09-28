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
import { IconRocket as Rocket } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  function dismiss() {
    markDismissed(audience);
    setClosed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="max-w-md rounded-2xl text-center sm:rounded-2xl">
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Rocket className="h-6 w-6" aria-hidden="true" />
          </span>
          <DialogTitle className="font-display text-xl font-bold tracking-tight">{promo.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground/70">{promo.message}</DialogDescription>
        </DialogHeader>
        <a
          href={promo.url}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          onClick={dismiss}
          className="clay-btn inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold"
        >
          {promo.buttonLabel}
          {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
        <button type="button" onClick={dismiss} className="text-xs font-semibold text-foreground/50 hover:text-foreground/80">
          Maybe later
        </button>
      </DialogContent>
    </Dialog>
  );
}
