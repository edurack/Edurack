// Pure email-safety rules: quiet hours, frequency cap, and what to do with bounce/complaint events.
// No I/O, so it's unit-tested (tests/email-policy.test.ts) and safe to import anywhere.
import { istMinuteOfDay } from "@/lib/streak-reminder-rules";

// ─── quiet hours (IST) ─────────────────────────────────────────────────────
/** Bulk sends pause from 22:00 to 08:00 IST. Streak reminders already clamp themselves to 08:00–21:00. */
export const QUIET_START_MIN = 22 * 60;
export const QUIET_END_MIN = 8 * 60;

export function isQuietHour(d: Date): boolean {
  const m = istMinuteOfDay(d);
  return m >= QUIET_START_MIN || m < QUIET_END_MIN;
}

// ─── frequency cap ─────────────────────────────────────────────────────────
export const DEFAULT_GAP_DAYS = 3;
/** Minimum days between two marketing emails to the same student (OUTREACH_MIN_GAP_DAYS). 0 turns the cap off. */
export function parseGapDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_GAP_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(30, Math.max(0, Math.floor(n))) : DEFAULT_GAP_DAYS;
}

// ─── recipients ────────────────────────────────────────────────────────────
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Split candidates into who may be emailed now, who is blocked, and who was emailed too recently. Blocked wins over recent. */
export function classifyRecipients<T extends { uid: string; email: string }>(list: T[], blockedEmails: Set<string>, recentUids: Set<string>) {
  const eligible: T[] = [], blocked: T[] = [], recent: T[] = [];
  for (const r of list) {
    if (blockedEmails.has(normalizeEmail(r.email))) blocked.push(r);
    else if (recentUids.has(r.uid)) recent.push(r);
    else eligible.push(r);
  }
  return { eligible, blocked, recent };
}

// ─── Resend webhook events ─────────────────────────────────────────────────
export type SuppressionReason = "complaint" | "hard_bounce" | "repeated_bounce" | "manual";
/** Soft bounces (full mailbox, temporary errors) are tolerated this many times in 30 days, then the address is blocked. */
export const SOFT_BOUNCE_LIMIT = 3;

export type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { to?: string[] | string; subject?: string; email_id?: string; bounce?: { type?: string; subType?: string; message?: string } };
};

export function eventRecipients(evt: ResendEvent): string[] {
  const to = evt.data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  return [...new Set(list.map(normalizeEmail).filter((e) => e.includes("@")))];
}

/** `bounceCount30d` includes the bounce being processed. */
export function decideSuppression(type: string | undefined, bounceType: string | undefined, bounceCount30d: number): SuppressionReason | null {
  if (type === "email.complained") return "complaint";
  if (type === "email.bounced") {
    if ((bounceType ?? "").toLowerCase() === "permanent") return "hard_bounce";
    return bounceCount30d >= SOFT_BOUNCE_LIMIT ? "repeated_bounce" : null;
  }
  return null;
}
