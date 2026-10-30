// "Invite a friend": share the student's link; when the friend finishes their first Quick Mock, both get
// +1 free Quick Mock a day for 7 days (rules in lib/referral.ts).
import { useEffect, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { getMyReferral } from "@/server-functions/referrals";
import { REFERRAL_BONUS_DAYS, referralLink, type ReferralSummary } from "@/lib/referral";
import { track, trackOnce } from "@/lib/analytics";

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function InviteCard({ user, source }: { user: { getIdToken: () => Promise<string> }; source: string }) {
  const [info, setInfo] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const r = await getMyReferral({ data: { token } });
        if (off) return;
        setInfo(r);
        if (r.code) trackOnce(`referral-card:${source}`, "referral_card_viewed", { source });
      } catch {
        /* no card if it can't load */
      }
    })();
    return () => {
      off = true;
    };
  }, [user, source]);

  if (!info?.code) return null;
  const link = referralLink(info.code);
  const message = `I practise for my exam on Edurack: timed PYQ Quick Mocks with a solution for every question. Join with my link and we both get a free extra Quick Mock a day for a week: ${link}`;

  async function share() {
    track("referral_share_clicked", { source, channel: typeof navigator !== "undefined" && typeof navigator.share === "function" ? "share_sheet" : "whatsapp" });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      navigator.share({ title: "Edurack", text: message }).catch(() => undefined);
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
  }
  async function copy() {
    track("referral_share_clicked", { source, channel: "copy" });
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the share button still works */
    }
  }

  return (
    <div className="clay p-5 sm:p-6" data-testid="invite-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
          <Gift className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Invite a friend, both get an extra Quick Mock</h2>
          <p className="mt-0.5 text-xs text-foreground/60">
            When your friend joins with your link and finishes their first Quick Mock, you both get +1 free Quick Mock a day for {REFERRAL_BONUS_DAYS} days.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={share} className="clay-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white">
          <Share2 className="h-4 w-4" aria-hidden /> Share your link
        </button>
        <button type="button" onClick={copy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-bold text-foreground hover:bg-foreground/5">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
      {(info.rewarded > 0 || info.bonusUntil) && (
        <p className="mt-3 text-xs font-semibold text-foreground/70">
          {info.rewarded > 0 ? `${info.rewarded} friend${info.rewarded === 1 ? "" : "s"} joined and finished a Quick Mock. ` : ""}
          {info.bonusUntil ? `Your bonus Quick Mock runs until ${dateLabel(info.bonusUntil)}.` : ""}
        </p>
      )}
    </div>
  );
}
