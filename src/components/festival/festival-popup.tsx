// Festival sale popup (Diwali or Christmas). Shown once per browser session, FESTIVAL_SALE.popupDelayMs after landing on a marketing page
// (see popupAllowed in lib/festival.ts for which pages). On phones it slides up as a bottom sheet; from the sm
// breakpoint it is a centred card. Closing it or tapping the button keeps it away for the rest of the session.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IconX as X, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { FESTIVAL_SALE, THEMES, festivalEndLabel, type FestivalTheme } from "@/lib/festival";
import { useFestivalSettings } from "./use-festival-settings";
import { track } from "@/lib/analytics";
import { SaleCountdown } from "./sale-countdown";
import { Diya, Sparkles, Tape, Tree } from "./festival-decor";
import { OfferHeadline, PriceLine } from "./sale-offer";
import "./festival-fonts";

const seen = (theme: FestivalTheme) => {
  try {
    return sessionStorage.getItem(THEMES[theme].popupStorageKey) === "1";
  } catch {
    return false;
  }
};
const markSeen = (theme: FestivalTheme) => {
  try {
    sessionStorage.setItem(THEMES[theme].popupStorageKey, "1");
  } catch {
    /* storage blocked: it just won't be remembered */
  }
};

export function FestivalPopup() {
  const settings = useFestivalSettings();
  const theme = settings.theme;
  const t = THEMES[theme];
  const p = t.prefix;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seen(theme)) return;
    const t = window.setTimeout(() => {
      setOpen(true);
      track("festival_popup_view", { theme });
    }, FESTIVAL_SALE.popupDelayMs);
    return () => window.clearTimeout(t);
  }, [theme]);

  function close() {
    markSeen(theme);
    setOpen(false);
  }

  const pct = settings.discountPercent;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`${p}-overlay fixed inset-0 z-[90]`} />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            // keep focus inside the dialog but off the close button, so it doesn't open with a focus ring on the ✕
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={`${p}-popup fixed inset-x-0 bottom-0 z-[91] mx-auto max-h-[94dvh] w-full max-w-[30rem] overflow-y-auto overscroll-contain rounded-t-[1.75rem] text-[#fff3dc] focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:mx-0 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem]`}
        >
          <div aria-hidden="true" className={`${p}-section-bg absolute inset-0 -z-10`} />
          <Sparkles theme={theme} count={theme === "christmas" ? 9 : 5} />

          <Tape theme={theme} percent={pct} />
          <DialogPrimitive.Close
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-12 z-10 grid h-10 w-10 place-items-center rounded-full border border-[#e8b04a]/35 bg-black/25 text-[#f6d77c] transition hover:bg-black/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd978]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          <div className="relative px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 text-center sm:px-8 sm:pb-8">
            <DialogPrimitive.Title className="m-0">
              <span className="sr-only">{t.label} sale: flat {pct}% off {FESTIVAL_SALE.productName}</span>
              <OfferHeadline theme={theme} percent={pct} size="popup" center />
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="mx-auto mt-4 max-w-[19rem] text-[15px] leading-relaxed text-[#f3dfb8]/80">
              on every {FESTIVAL_SALE.productName} plan. Unlimited mocks, your own drills, smarter analysis.
            </DialogPrimitive.Description>

            <PriceLine theme={theme} className="mt-3 justify-center" />

            <SaleCountdown theme={theme} compact className="mt-6" />

            <Link
              to={FESTIVAL_SALE.ctaPath}
              onClick={() => {
                track("festival_cta_click", { theme, from: "popup" });
                close();
              }}
              className={`${p}-btn-gold mt-6 w-full`}
            >
              Claim {pct}% off
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={close} className="mt-2 min-h-11 px-4 text-sm font-medium text-[#e9c98a]/70 transition hover:text-[#ffe3a0]">
              Maybe later
            </button>
            <p className="text-[11px] text-[#e9c98a]/45">Applied automatically at checkout · till {festivalEndLabel(settings.endsAt)} IST</p>
          </div>

          {theme === "christmas" ? (
            <>
              <Tree className="pointer-events-none absolute bottom-3 left-4 hidden h-16 w-14 opacity-95 sm:block" />
              <Tree className="pointer-events-none absolute bottom-3 right-4 hidden h-16 w-14 -scale-x-100 opacity-95 sm:block" />
            </>
          ) : (
            <>
              <Diya className="pointer-events-none absolute bottom-3 left-4 hidden h-14 w-[4.5rem] opacity-90 sm:block" />
              <Diya className="pointer-events-none absolute bottom-3 right-4 hidden h-14 w-[4.5rem] -scale-x-100 opacity-90 sm:block" />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
