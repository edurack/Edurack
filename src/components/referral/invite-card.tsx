// "Invite a friend": share the student's link; when the friend finishes their first Quick Mock, both get
// REFERRAL_PRO_DAYS days of Edurack Pro each (rules in lib/referral.ts).
//
// The card only shows while the offer is real (the free plan limits Quick Mocks and the student is not on Pro), builds the
// link from the page's own origin so it works on localhost and staging, tells students what is happening (friends waiting,
// their own invite status, why a bonus didn't apply), and lets a new student enter a friend's code if the link got lost.
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { claimReferral, getMyReferral } from "@/server-functions/referrals";
import { REFERRAL_PRO_DAYS, normalizeReferralCode, referralLink, referralReasonMessage, type ReferralSummary } from "@/lib/referral";
import { track, trackOnce } from "@/lib/analytics";

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function InviteCard({ user, source }: { user: { getIdToken: () => Promise<string> }; source: string }) {
  const [info, setInfo] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await user.getIdToken();
      const r = await getMyReferral({ data: { token } });
      setInfo(r);
      if (r.code && r.offerActive) trackOnce(`referral-card:${source}`, "referral_card_viewed", { source });
    } catch {
      /* no card if it can't load */
    }
  }, [user, source]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!info?.code || !info.offerActive) return null;
  const link = referralLink(info.code, typeof window !== "undefined" ? window.location.origin : undefined);
  const message = `I practise for my exam on Edurack: timed PYQ Quick Mocks with a solution for every question. Join with my link and we both get ${REFERRAL_PRO_DAYS} days of Edurack Pro free: ${link}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function share() {
    track("referral_share_clicked", { source, channel: canShare ? "share_sheet" : "whatsapp" });
    if (canShare) {
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
  async function applyCode() {
    setClaiming(true);
    setClaimMsg(null);
    try {
      const token = await user.getIdToken();
      const r = await claimReferral({ data: { token, code } });
      if (r.applied) {
        setCode("");
        setClaimMsg("Done. Finish your first Quick Mock and you both get the Pro days.");
        await load();
      } else {
        setClaimMsg(referralReasonMessage(r.reason));
      }
    } catch {
      setClaimMsg("Couldn't apply the code. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  const mine = info.mine;
  return (
    <div className="clay p-5 sm:p-6" data-testid="invite-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sky-soft)]">
          <Gift className="h-5 w-5 text-[var(--sky-deep)]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Invite a friend, you both get {REFERRAL_PRO_DAYS} days of Pro</h2>
          <p className="mt-0.5 text-xs text-foreground/60">
            When your friend joins with your link and finishes their first Quick Mock, you both get {REFERRAL_PRO_DAYS} days of Edurack Pro: every Pro feature, added to any Pro you already have.
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
      <p className="mt-2 text-xs text-foreground/50">
        Your invite code: <span className="font-bold tracking-widest text-foreground">{info.code}</span>. A friend can also type it when they sign up.
      </p>

      <div className="mt-3 space-y-1.5 text-xs font-semibold text-foreground/70" aria-live="polite">
        {info.pending > 0 && (
          <p>
            {info.pending} friend{info.pending === 1 ? "" : "s"} joined with your link. Their first finished Quick Mock unlocks the bonus for you both.
          </p>
        )}
        {info.rewarded > 0 && <p>{info.rewarded} friend{info.rewarded === 1 ? "" : "s"} joined and finished a Quick Mock. You earned {info.rewarded * REFERRAL_PRO_DAYS} days of Pro.</p>}
        {info.bonusUntil && <p>Your extra free Quick Mock a day runs until {dateLabel(info.bonusUntil)}.</p>}
        {(mine?.status === "pending" || mine?.status === "rewarding") && (
          <p>You joined with a friend's link. Finish your first Quick Mock and you both get {REFERRAL_PRO_DAYS} days of Edurack Pro.</p>
        )}
        {mine?.status === "rejected" && <p className="text-destructive">{referralReasonMessage(mine.reason)}</p>}
      </div>

      {info.canClaim && (
        <div className="mt-4 border-t border-border pt-4">
          <label htmlFor={`invite-claim-${source}`} className="block text-xs font-semibold text-foreground/70">
            Joined through a friend? Enter their invite code
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={`invite-claim-${source}`}
              value={code}
              onChange={(e) => setCode(normalizeReferralCode(e.target.value))}
              placeholder="6-character code"
              autoCapitalize="characters"
              autoComplete="off"
              className="clay-inset min-h-11 min-w-0 flex-1 px-4 text-sm tracking-widest placeholder:tracking-normal placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={applyCode}
              disabled={claiming || code.length !== 6}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-bold text-foreground hover:bg-foreground/5 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          {claimMsg && (
            <p role="status" className="mt-2 text-xs font-semibold text-foreground/70">
              {claimMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
