// Student-to-student referrals: the rules shared by the server and the UI (pure: no I/O).
//
// A student shares their link (/?ref=CODE). When the friend signs up with it and FINISHES THEIR FIRST QUICK MOCK, both get
// REFERRAL_BONUS_PER_DAY extra free Quick Mock a day for REFERRAL_BONUS_DAYS days. Rewards stack, up to REFERRAL_MAX_BONUS_DAYS
// ahead, and a student can earn the reward for at most REFERRAL_MAX_REWARDS friends. Waiting for the first finished Quick Mock
// (not just sign-up) is what keeps fake accounts from earning it.
import { SITE_URL } from "@/lib/seo";

export const REFERRAL_BONUS_DAYS = 7;
export const REFERRAL_BONUS_PER_DAY = 1;
export const REFERRAL_MAX_BONUS_DAYS = 60;
export const REFERRAL_MAX_REWARDS = 10;

/** 6 characters, no 0/O/1/I so a code can be read out loud. */
const CODE = /^[23456789A-HJ-NP-Z]{6}$/;
export const isValidReferralCode = (v: unknown): v is string => typeof v === "string" && CODE.test(v);

export const referralLink = (code: string) => `${SITE_URL}/?ref=${code}`;

/** The new end of the bonus window after one more reward: 7 days on top of what is left, never more than 60 days from now. */
export function extendBonusUntil(current: Date | null, now: Date): Date {
  const day = 86_400_000;
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(Math.min(base.getTime() + REFERRAL_BONUS_DAYS * day, now.getTime() + REFERRAL_MAX_BONUS_DAYS * day));
}

export type ReferralSummary = { code: string | null; invited: number; rewarded: number; bonusUntil: string | null };
