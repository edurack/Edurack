// SERVER-ONLY. Builds the Growth ops numbers for the admin screen. Read-only: counts and small aggregates over collections the
// growth features write (lifecycleEmailLog, referrals, proGrants, pyqDrills, challenges, profiles). `days` is the window (7 or 30).
import { getDb } from "@/lib/mongo";
import { istDayKey } from "@/lib/practice-schedule";
import { referralReasonMessage } from "@/lib/referral";
import type { GrowthOps } from "@/lib/growth-ops-types";

const KIND_LABEL: Record<string, string> = {
  first_drill: "First Quick Mock nudge (day 1)",
  weak_chapter: "Yesterday's weak chapter",
  revision_due: "Revision due",
};

/** Share of `part` in `whole`, one decimal; null when there is no whole to divide by. */
export const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Splits the drills started in a window into types. The categories are not exclusive in the data, so "standard" is what is left. */
export function drillTypes(total: number, revision: number, custom: number, challenge: number) {
  return { standard: Math.max(0, total - revision - custom - challenge), custom, revision, challenge };
}

export async function buildGrowthOps(days: number, now: Date = new Date()): Promise<GrowthOps> {
  const window = days === 30 ? 30 : 7;
  const db = await getDb();
  const since = new Date(now.getTime() - window * 86_400_000);
  const sinceDay = istDayKey(since);
  const inWindow = { $gte: since };

  const [
    emailRows, studentsEmailed, streakReminders,
    optNudges, optStreak, optMarketing, optNudgesW, optStreakW, optMarketingW,
    refTotal, refStatusRows, refRejectedRows, refCreatedW, refRewardedW, refProGrantRows, refTopRows,
    profiles, withRealMobile, withConsentRecord, marketingOptIn,
    drillsStarted, drillsSubmitted, studentsDrilling, drillsRevision, drillsCustom, drillsChallenge,
    grantsPaid, grantsGift, grantsReferral, proNowRows,
    challengesCreated, challengeAttempts, challengeCompleted,
    timingSubmitted, timingWith,
  ] = await Promise.all([
    db.collection("lifecycleEmailLog").aggregate([{ $match: { sentAt: inWindow } }, { $group: { _id: { kind: "$kind", status: "$status" }, n: { $sum: 1 } } }]).toArray(),
    db.collection("lifecycleEmailLog").distinct("uid", { sentAt: inWindow, status: "sent" }),
    db.collection("streakReminderLog").countDocuments({ day: { $gte: sinceDay } }),
    db.collection("profiles").countDocuments({ "emailOptOut.nudges": true }),
    db.collection("profiles").countDocuments({ "emailOptOut.streak": true }),
    db.collection("profiles").countDocuments({ "emailOptOut.marketing": true }),
    db.collection("profiles").countDocuments({ "emailOptOut.nudges": true, "emailOptOut.updatedAt": inWindow }),
    db.collection("profiles").countDocuments({ "emailOptOut.streak": true, "emailOptOut.updatedAt": inWindow }),
    db.collection("profiles").countDocuments({ "emailOptOut.marketing": true, "emailOptOut.updatedAt": inWindow }),
    db.collection("referrals").countDocuments({}),
    db.collection("referrals").aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    db.collection("referrals").aggregate([{ $match: { status: "rejected" } }, { $group: { _id: "$reason", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    db.collection("referrals").countDocuments({ createdAt: inWindow }),
    db.collection("referrals").countDocuments({ status: "rewarded", rewardedAt: inWindow }),
    db.collection("proGrants").aggregate([{ $match: { via: "referral", createdAt: inWindow } }, { $group: { _id: null, days: { $sum: "$durationDays" } } }]).toArray(),
    db.collection("referrals").aggregate([
      { $group: { _id: "$referrerUid", invited: { $sum: 1 }, rewarded: { $sum: { $cond: [{ $eq: ["$status", "rewarded"] }, 1, 0] } } } },
      { $sort: { rewarded: -1, invited: -1 } },
      { $limit: 5 },
    ]).toArray(),
    db.collection("profiles").countDocuments({}),
    db.collection("profiles").countDocuments({ mobile: { $regex: "^[6-9][0-9]{9}$" } }),
    db.collection("profiles").countDocuments({ mobileConsent: { $exists: true } }),
    db.collection("profiles").countDocuments({ "mobileConsent.marketing": true }),
    db.collection("pyqDrills").countDocuments({ startedAt: inWindow }),
    db.collection("pyqDrills").countDocuments({ submittedAt: inWindow }),
    db.collection("pyqDrills").distinct("uid", { startedAt: inWindow }),
    db.collection("pyqDrills").countDocuments({ startedAt: inWindow, "filters.mistakes": true }),
    db.collection("pyqDrills").countDocuments({ startedAt: inWindow, filters: { $ne: null }, "filters.mistakes": { $ne: true } }),
    db.collection("pyqDrills").countDocuments({ startedAt: inWindow, challengeCode: { $exists: true } }),
    db.collection("proGrants").countDocuments({ createdAt: inWindow, source: { $ne: "gift" } }),
    db.collection("proGrants").countDocuments({ createdAt: inWindow, source: "gift", via: { $ne: "referral" } }),
    db.collection("proGrants").countDocuments({ createdAt: inWindow, via: "referral" }),
    db.collection("proGrants").distinct("uid", { startsAt: { $lte: now }, endsAt: { $gt: now } }),
    db.collection("challenges").countDocuments({ createdAt: inWindow }),
    db.collection("pyqDrills").countDocuments({ startedAt: inWindow, challengeCode: { $exists: true } }),
    db.collection("pyqDrills").countDocuments({ submittedAt: inWindow, challengeCode: { $exists: true } }),
    db.collection("pyqDrills").countDocuments({ submittedAt: inWindow }),
    db.collection("pyqDrills").countDocuments({ submittedAt: inWindow, times: { $exists: true } }),
  ]);

  // Email counts per kind and outcome.
  const kinds = new Map<string, { sent: number; failed: number }>();
  for (const k of Object.keys(KIND_LABEL)) kinds.set(k, { sent: 0, failed: 0 });
  for (const r of emailRows) {
    const kind = String((r._id as { kind?: string }).kind ?? "");
    const status = String((r._id as { status?: string }).status ?? "");
    const row = kinds.get(kind) ?? { sent: 0, failed: 0 };
    if (status === "sent") row.sent += r.n as number;
    else if (status === "failed") row.failed += r.n as number;
    kinds.set(kind, row);
  }

  const byStatus = { pending: 0, rewarded: 0, rejected: 0 };
  for (const r of refStatusRows) {
    const s = String(r._id);
    if (s === "rewarded") byStatus.rewarded += r.n as number;
    else if (s === "rejected") byStatus.rejected += r.n as number;
    else byStatus.pending += r.n as number; // pending and the brief "rewarding" state
  }

  // Top referrers: show the email so the team can say thank you.
  const topUids = refTopRows.map((r) => String(r._id));
  const topProfiles = topUids.length ? await db.collection("profiles").find({ uid: { $in: topUids } }, { projection: { uid: 1, email: 1 } }).toArray() : [];
  const emailOf = new Map(topProfiles.map((p) => [String(p.uid), (p.email as string | undefined) ?? null]));

  return {
    days: window,
    generatedAt: now.toISOString(),
    emails: {
      byKind: [...kinds.entries()].map(([kind, v]) => ({ kind, label: KIND_LABEL[kind] ?? kind, ...v })),
      studentsEmailed: studentsEmailed.length,
      streakReminders,
      optedOut: { nudges: optNudges, streak: optStreak, marketing: optMarketing },
      optedOutInWindow: { nudges: optNudgesW, streak: optStreakW, marketing: optMarketingW },
    },
    referrals: {
      total: refTotal,
      byStatus,
      rejectedByReason: refRejectedRows.map((r) => ({ reason: String(r._id ?? "unknown"), label: referralReasonMessage(String(r._id ?? "")), n: r.n as number })),
      createdInWindow: refCreatedW,
      rewardedInWindow: refRewardedW,
      proDaysGivenInWindow: (refProGrantRows[0]?.days as number | undefined) ?? 0,
      top: refTopRows.map((r) => ({ email: emailOf.get(String(r._id)) ?? null, rewarded: r.rewarded as number, invited: r.invited as number })),
    },
    consent: {
      profiles,
      withRealMobile,
      withConsentRecord,
      marketingOptIn,
      marketingOptInPct: pct(marketingOptIn, withConsentRecord),
      withoutConsentRecord: Math.max(0, withRealMobile - withConsentRecord),
    },
    pro: {
      drillsStarted,
      drillsSubmitted,
      studentsDrilling: studentsDrilling.length,
      byType: drillTypes(drillsStarted, drillsRevision, drillsCustom, drillsChallenge),
      grantsInWindow: { paid: grantsPaid, gift: grantsGift, referral: grantsReferral },
      proStudentsNow: proNowRows.length,
    },
    challenges: { created: challengesCreated, attemptsStarted: challengeAttempts, attemptsCompleted: challengeCompleted },
    timing: { submitted: timingSubmitted, withTimes: timingWith },
  };
}
