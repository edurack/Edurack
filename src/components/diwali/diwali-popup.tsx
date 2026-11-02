// Diwali sale popup. Shown once per browser session, DIWALI_SALE.popupDelayMs after landing on a marketing page
// (see popupAllowed in lib/diwali.ts for which pages). On phones it slides up as a bottom sheet; from the sm
// breakpoint it is a centred card. Closing it or tapping the button keeps it away for the rest of the session.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IconX as X, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { DIWALI_SALE, diwaliEndLabel } from "@/lib/diwali";
import { useDiwaliSettings } from "./use-diwali-settings";
import { track } from "@/lib/analytics";
import { DiwaliCountdown } from "./diwali-countdown";
import { Diya, Sparkles, Tape } from "./diwali-decor";
import { OfferHeadline, PriceLine } from "./diwali-offer";
import "./diwali-fonts";

const seen = () => {
  try {
    return sessionStorage.getItem(DIWALI_SALE.popupStorageKey) === "1";
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    sessionStorage.setItem(DIWALI_SALE.popupStorageKey, "1");
  } catch {
    /* storage blocked: it just won't be remembered */
  }
};

export function DiwaliPopup() {
  const settings = useDiwaliSettings();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seen()) return;
    const t = window.setTimeout(() => {
      setOpen(true);
      track("diwali_popup_view");
    }, DIWALI_SALE.popupDelayMs);
    return () => window.clearTimeout(t);
  }, []);

  function close() {
    markSeen();
    setOpen(false);
  }

  const pct = settings.discountPercent;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dw-overlay fixed inset-0 z-[90]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            // keep focus inside the dialog but off the close button, so it doesn't open with a focus ring on the ✕
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className="dw-popup fixed inset-x-0 bottom-0 z-[91] mx-auto max-h-[94dvh] w-full max-w-[30rem] overflow-y-auto overscroll-contain rounded-t-[1.75rem] text-[#fff3dc] focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:mx-0 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem]"
        >
          <div aria-hidden="true" className="dw-section-bg absolute inset-0 -z-10" />
          <Sparkles count={5} />

          <Tape percent={pct} />
          <DialogPrimitive.Close
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-12 z-10 grid h-10 w-10 place-items-center rounded-full border border-[#e8b04a]/35 bg-black/25 text-[#f6d77c] transition hover:bg-black/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd978]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          <div className="relative px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 text-center sm:px-8 sm:pb-8">
            <DialogPrimitive.Title className="m-0">
              <span className="sr-only">Diwali sale: flat {pct}% off {DIWALI_SALE.productName}</span>
              <OfferHeadline percent={pct} size="popup" center />
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="mx-auto mt-4 max-w-[19rem] text-[15px] leading-relaxed text-[#f3dfb8]/80">
              on every {DIWALI_SALE.productName} plan. Unlimited mocks, your own drills, smarter analysis.
            </DialogPrimitive.Description>

            <PriceLine className="mt-3 justify-center" />

            <DiwaliCountdown compact className="mt-6" />

            <Link
              to={DIWALI_SALE.ctaPath}
              onClick={() => {
                track("diwali_cta_click", { from: "popup" });
                close();
              }}
              className="dw-btn-gold mt-6 w-full"
            >
              Claim {pct}% off
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={close} className="mt-2 min-h-11 px-4 text-sm font-medium text-[#e9c98a]/70 transition hover:text-[#ffe3a0]">
              Maybe later
            </button>
            <p className="text-[11px] text-[#e9c98a]/45">Applied automatically at checkout · till {diwaliEndLabel(settings.endsAt)} IST</p>
          </div>

          <Diya className="pointer-events-none absolute bottom-3 left-4 hidden h-14 w-[4.5rem] opacity-90 sm:block" />
          <Diya className="pointer-events-none absolute bottom-3 right-4 hidden h-14 w-[4.5rem] -scale-x-100 opacity-90 sm:block" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
