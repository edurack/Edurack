// Browser side of referrals: remember the ?ref= code a friend arrived with until they finish sign-up.
import { isValidReferralCode } from "@/lib/referral";

const KEY = "edurack-ref";

/** Call on the landing page and the sign-in page: stores a valid ?ref=CODE from the URL. */
export function captureReferralFromUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
    if (code && isValidReferralCode(code)) localStorage.setItem(KEY, code);
  } catch {
    /* storage unavailable: the referral is a bonus, never a blocker */
  }
}

/** The stored code, once: it is removed so it is only ever claimed one time. */
export function takeStoredReferral(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v) localStorage.removeItem(KEY);
    return v && isValidReferralCode(v) ? v : null;
  } catch {
    return null;
  }
}
