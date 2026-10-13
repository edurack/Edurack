// SERVER-ONLY. Numbers for the COO "Growth Hub", computed from collections you already have:
// profiles, practiceEvents, practiceStreaks, outreachLog, outreachCampaigns.
import { getDb } from "@/lib/mongo";
import { addDays, istDayKey } from "@/lib/practice-schedule";
import type { GrowthSnapshot } from "@/lib/growth-types";

const DAY = 864e5;
const pretty = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "—";

export async function buildGrowthSnapshot(): Promise<GrowthSnapshot> {
  const db = await getDb();
  const now = new Date();
  const today = istDayKey(now);
  const yesterday = addDays(today, -1);
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const profiles = db.collection("profiles");
  const events = db.collection("practiceEvents");
  const streaks = db.collection("practiceStreaks");
  const distinctUsers = async (from: Date) => ((await events.aggregate([{ $match: { at: { $gte: from } } }, { $group: { _id: "$uid" } }, { $count: "n" }]).toArray())[0]?.n as number) ?? 0;

  const [students, new1d, new7d, prev7d, new30d, signupRows, dau, wau, mau, actRows, ans7, cor7, streakAgg, everPracticed, ge3, ge7, examRows, trackRows, subjRows, chapRows, sent7d, campaigns, firstEvent] = await Promise.all([
    profiles.countDocuments({}),
    profiles.countDocuments({ createdAt: { $gte: since(1) } }),
    profiles.countDocuments({ createdAt: { $gte: since(7) } }),
    profiles.countDocuments({ createdAt: { $gte: since(14), $lt: since(7) } }),
    profiles.countDocuments({ createdAt: { $gte: since(30) } }),
    profiles.aggregate([{ $match: { createdAt: { $gte: since(31) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, n: { $sum: 1 } } }]).toArray(),
    distinctUsers(since(1)), distinctUsers(since(7)), distinctUsers(since(30)),
    events.aggregate([{ $match: { at: { $gte: since(15) }, outcome: { $ne: "revealed" } } }, { $group: { _id: { d: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Asia/Kolkata" } }, u: "$uid" }, n: { $sum: 1 } } }, { $group: { _id: "$_id.d", answered: { $sum: "$n" }, active: { $sum: 1 } } }]).toArray(),
    events.countDocuments({ at: { $gte: since(7) }, outcome: { $ne: "revealed" } }),
    events.countDocuments({ at: { $gte: since(7) }, outcome: "correct" }),
    streaks.aggregate([{ $group: { _id: null, doneToday: { $sum: { $cond: [{ $eq: ["$lastDay", today] }, 1, 0] } }, atRisk: { $sum: { $cond: [{ $and: [{ $eq: ["$lastDay", yesterday] }, { $gt: ["$current", 0] }] }, 1, 0] } }, best: { $max: "$longest" } } }]).toArray(),
    streaks.countDocuments({}),
    streaks.countDocuments({ longest: { $gte: 3 } }),
    streaks.countDocuments({ longest: { $gte: 7 } }),
    profiles.aggregate([{ $group: { _id: { $toUpper: { $ifNull: ["$targetExam", "NEET"] } }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    profiles.aggregate([{ $group: { _id: { $ifNull: ["$track", "Not set"] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    events.aggregate([{ $match: { at: { $gte: since(7) }, outcome: { $ne: "revealed" } } }, { $group: { _id: "$subject", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]).toArray(),
    events.aggregate([{ $match: { at: { $gte: since(7) }, outcome: { $ne: "revealed" } } }, { $group: { _id: { s: "$subject", c: "$chapterKey" }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]).toArray(),
    db.collection("outreachLog").countDocuments({ status: "sent", sentAt: { $gte: since(7) } }),
    db.collection("outreachCampaigns").countDocuments({}),
    events.find({}, { projection: { at: 1 } }).sort({ at: 1 }).limit(1).toArray(),
  ]);

  const signupMap = new Map(signupRows.map((r) => [String(r._id), r.n as number]));
  const actMap = new Map(actRows.map((r) => [String(r._id), r as any]));
  const signups = Array.from({ length: 30 }, (_, i) => { const day = addDays(today, i - 29); return { day, n: signupMap.get(day) ?? 0 }; });
  const activity = Array.from({ length: 14 }, (_, i) => { const day = addDays(today, i - 13); const r = actMap.get(day); return { day, answered: r?.answered ?? 0, active: r?.active ?? 0 }; });
  const s = streakAgg[0] ?? { doneToday: 0, atRisk: 0, best: 0 };

  return {
    generatedAt: now.toISOString(),
    totals: { students, new1d, new7d, prev7d, new30d },
    signups, activity,
    active: { dau, wau, mau },
    answered7d: ans7, accuracy7d: ans7 ? Math.round((cor7 / ans7) * 100) : null,
    funnel: [
      { label: "Signed up", n: students },
      { label: "Answered a question", n: Math.min(everPracticed, students) },
      { label: "3-day streak", n: ge3 },
      { label: "7-day streak", n: ge7 },
    ],
    streaks: { doneToday: s.doneToday, atRisk: s.atRisk, best: s.best ?? 0 },
    neverPracticed: Math.max(0, students - everPracticed),
    segments: {
      exam: examRows.map((r) => ({ label: String(r._id), n: r.n as number })),
      track: trackRows.map((r) => ({ label: String(r._id), n: r.n as number })),
    },
    subjects7d: subjRows.map((r) => ({ label: String(r._id ?? "—"), n: r.n as number })),
    chapters7d: chapRows.map((r) => ({ label: pretty(String(r._id.c ?? "")), subject: String(r._id.s ?? "—"), n: r.n as number })),
    outreach: { sent7d, campaigns },
    eventsSince: firstEvent[0]?.at instanceof Date ? firstEvent[0].at.toISOString() : null,
  };
}
