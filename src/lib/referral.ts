// Student-to-student referrals: the rules shared by the server and the UI (pure: no I/O).
//
// A student shares their link (/?ref=CODE). When the friend signs up with it and FINISHES THEIR FIRST QUICK MOCK, both get
// REFERRAL_PRO_DAYS days of Edurack Pro (every Pro feature), added on top of any Pro they already have. A student can earn
// the reward for at most REFERRAL_MAX_REWARDS friends. Waiting for the first finished Quick Mock (not just sign-up) is
// what keeps fake accounts from earning it, and giving Pro days (not just more free Quick Mocks) lets friends try the
// paid features. (Until October 2026 the reward was +1 free Quick Mock a day; those bonuses are honoured until they expire.)
import { SITE_URL } from "@/lib/seo";

export const REFERRAL_PRO_DAYS = 3;
/** Legacy +1 free Quick Mock a day bonus: no longer granted, still honoured until it expires. */
export const REFERRAL_BONUS_DAYS = 7;
export const REFERRAL_BONUS_PER_DAY = 1;
export const REFERRAL_MAX_BONUS_DAYS = 60;
export const REFERRAL_MAX_REWARDS = 10;

/** 6 characters, no 0/O/1/I so a code can be read out loud. */
const CODE = /^[23456789A-HJ-NP-Z]{6}$/;
export const isValidReferralCode = (v: unknown): v is string => typeof v === "string" && CODE.test(v);

/** The invite link. Pass the page's own origin in the browser so it also works on localhost and staging (SITE_URL is always production). */
export const referralLink = (code: string, origin: string = SITE_URL) => `${origin}/?ref=${code}`;

export const REFERRAL_CLAIM_WINDOW_DAYS = 3;
/** Whatever was typed or pasted, reduced to at most 6 letters and digits, upper case. */
export const normalizeReferralCode = (v: string) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);

/** Plain-words reason shown to the student when a referral did not go through. */
export function referralReasonMessage(reason?: string): string {
  switch (reason) {
    case "same_mobile":
      return "The bonus didn't apply: this mobile number is already on your friend's account.";
    case "duplicate_mobile":
      return "The bonus didn't apply: this mobile number has already earned a referral bonus.";
    case "not_new":
      return `The bonus didn't apply: invite codes only work for accounts made in the last ${REFERRAL_CLAIM_WINDOW_DAYS} days.`;
    case "invalid":
    case "unknown_code":
      return "That invite code wasn't found. Check it and try again.";
    case "already_claimed":
    case "not_eligible":
      return "You have already used an invite code.";
    default:
      return "The bonus didn't apply.";
  }
}

/** The new end of the bonus window after one more reward: 7 days on top of what is left, never more than 60 days from now. */
export function extendBonusUntil(current: Date | null, now: Date): Date {
  const day = 86_400_000;
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(Math.min(base.getTime() + REFERRAL_BONUS_DAYS * day, now.getTime() + REFERRAL_MAX_BONUS_DAYS * day));
}

export type ReferralStatus = "pending" | "rewarding" | "rewarded" | "rejected";
export type ReferralSummary = {
  code: string | null;
  /** Friends who used this student's link. */
  invited: number;
  /** Of those, how many have joined but not yet finished their first Quick Mock. */
  pending: number;
  rewarded: number;
  bonusUntil: string | null;
  /** The reward is Pro days, so it is only worth offering while Pro is on sale (a plan is published). */
  offerActive: boolean;
  /** This student's own record if they joined through a friend. */
  mine: { status: ReferralStatus; reason?: string } | null;
  /** A new account that has not used an invite yet: it can still enter a friend's code. */
  canClaim: boolean;
};
