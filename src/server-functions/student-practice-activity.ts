// Admin-only: exactly what a student solved, when, and how it went.
// Powers the "What they solved" section in the student drawer.
//
// Source of truth is the append-only `practiceEvents` log (written by the patched
// recordPracticeOutcomes). Students who practised BEFORE that patch have no events,
// so for them we fall back to practiceProgress (latest state per question) and flag
// the result `approximate: true`.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { addDays, istDayKey } from "@/lib/practice-schedule";
import { formatIstMinute, reminderMinuteFor } from "@/lib/streak-reminder-rules";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

export type PracticeActivityRow = {
  at: string;
  questionId: string;
  subject: string;
  chapter: string;
  topic: string;
  type: "mcq" | "integer" | string;
  year: string | null;
  snippet: string;
  outcome: "correct" | "wrong" | "revealed";
  /** What the student answered (option letter / number). */
  answer: string | number | null;
  /** The right answer, shown to the admin so a wrong answer is easy to read. */
  correctAnswer: string | number | null;
};

export type StudentPracticeActivity = {
  approximate: boolean;
  lastPracticedAt: string | null;
  streak: { current: number; longest: number; lastDay: string | null; doneToday: boolean; alive: boolean };
  reminder: { usualTimeIst: string; lastSent: { day: string; status: string; at: string | null } | null };
  days: { day: string; answered: number; correct: number; wrong: number; revealed: number }[];
  chapters: { subject: string; chapter: string; attempted: number; correct: number; accuracy: number }[];
  recent: PracticeActivityRow[];
  drills: { startedAt: string | null; submittedAt: string | null; score: number | null; maxScore: number | null; correct: number | null; wrong: number | null; skipped: number | null; timeTakenSec: number | null }[];
};

/** Question bodies can be markdown/HTML/LaTeX — a short plain-text hint is enough for an admin timeline. */
const snippetOf = (body: unknown) =>
  String(body ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

export const getAdminStudentPracticeActivity = createServerFn({ method: "POST" })
  .validator((data: { token: string; uid: string; limit?: number }) => data)
  .handler(async ({ data }): Promise<StudentPracticeActivity> => {
    await requireAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const limit = Math.min(200, Math.max(10, data.limit ?? 80));
    const now = new Date();
    const today = istDayKey(now);

    const [streakDoc, eventCount, drillDocs, lastReminder] = await Promise.all([
      db.collection("practiceStreaks").findOne({ uid: data.uid }),
      db.collection("practiceEvents").countDocuments({ uid: data.uid }, { limit: 1 }),
      db.collection("pyqDrills").find({ uid: data.uid }).sort({ startedAt: -1 }).limit(20).toArray(),
      db.collection("streakReminderLog").find({ uid: data.uid }).sort({ createdAt: -1 }).limit(1).next(),
    ]);
    const approximate = eventCount === 0;

    // Normalised rows from whichever source we have.
    type Raw = { questionId: string; outcome: "correct" | "wrong" | "revealed"; answer: string | number | null; at: Date; subject?: string; chapterKey?: string };
    let raw: Raw[];
    if (!approximate) {
      const since = new Date(now.getTime() - 14 * 86_400_000);
      raw = (await db.collection("practiceEvents").find({ uid: data.uid, at: { $gte: since } }).sort({ at: -1 }).limit(2000).toArray()).map((e) => ({
        questionId: String(e.questionId), outcome: e.outcome, answer: e.answer ?? null, at: e.at as Date, subject: e.subject, chapterKey: e.chapterKey,
      }));
    } else {
      raw = (await db.collection("practiceProgress").find({ uid: data.uid, updatedAt: { $type: "date" } }).sort({ updatedAt: -1 }).limit(2000).toArray()).map((p) => ({
        questionId: String(p.questionId),
        outcome: p.revealed === true && !(Number(p.attempts) > 0) ? "revealed" : p.correct === true ? "correct" : "wrong",
        answer: p.lastAnswer ?? null, at: p.updatedAt as Date, subject: p.subject, chapterKey: p.chapterKey,
      }));
    }

    // Join question details for the rows we'll actually display.
    const shown = raw.slice(0, limit);
    const oids = [...new Set(shown.map((r) => r.questionId))].filter((id) => /^[a-f0-9]{24}$/i.test(id)).map((id) => new ObjectId(id));
    const qDocs = oids.length
      ? await db.collection("questions").find({ _id: { $in: oids } }, { projection: { subject: 1, chapter: 1, topic: 1, type: 1, body: 1, pyqYear: 1, correctOption: 1, correctAnswer: 1 } }).toArray()
      : [];
    const qById = new Map(qDocs.map((q) => [String(q._id), q]));

    const recent: PracticeActivityRow[] = shown.map((r) => {
      const q = qById.get(r.questionId);
      return {
        at: r.at.toISOString(),
        questionId: r.questionId,
        subject: String(q?.subject ?? r.subject ?? "—"),
        chapter: String(q?.chapter ?? r.chapterKey ?? "—"),
        topic: String(q?.topic ?? ""),
        type: String(q?.type ?? ""),
        year: q?.pyqYear != null ? String(q.pyqYear) : null,
        snippet: snippetOf(q?.body) || "(question no longer available)",
        outcome: r.outcome,
        answer: r.answer,
        correctAnswer: (q?.correctOption as string | undefined) ?? (q?.correctAnswer as number | undefined) ?? null,
      };
    });

    // 14-day rollup (IST days).
    const dayMap = new Map<string, { answered: number; correct: number; wrong: number; revealed: number }>();
    for (let i = 13; i >= 0; i--) dayMap.set(addDays(today, -i), { answered: 0, correct: 0, wrong: 0, revealed: 0 });
    for (const r of raw) {
      const d = dayMap.get(istDayKey(r.at));
      if (!d) continue;
      if (r.outcome === "revealed") d.revealed++;
      else (d.answered++, r.outcome === "correct" ? d.correct++ : d.wrong++);
    }

    // Chapter accuracy over the student's whole notebook (latest state per question).
    const chapterAgg = await db
      .collection("practiceProgress")
      .aggregate([
        { $match: { uid: data.uid, attempts: { $gt: 0 } } },
        { $group: { _id: { subject: "$subject", chapter: "$chapterKey" }, attempted: { $sum: 1 }, correct: { $sum: { $cond: ["$correct", 1, 0] } } } },
        { $sort: { attempted: -1 } },
        { $limit: 12 },
      ])
      .toArray();

    const lastPracticedAt = streakDoc?.lastPracticedAt instanceof Date ? (streakDoc.lastPracticedAt as Date) : raw.find((r) => r.outcome !== "revealed")?.at ?? null;
    const current = Number(streakDoc?.current ?? 0);
    const lastDay = (streakDoc?.lastDay as string | null) ?? null;
    const doneToday = lastDay === today;

    return {
      approximate,
      lastPracticedAt: lastPracticedAt ? lastPracticedAt.toISOString() : null,
      streak: { current, longest: Number(streakDoc?.longest ?? 0), lastDay, doneToday, alive: doneToday || lastDay === addDays(today, -1) },
      reminder: {
        usualTimeIst: formatIstMinute(reminderMinuteFor(lastPracticedAt, Number(process.env.STREAK_REMINDER_LEAD_MINUTES ?? 0))),
        lastSent: lastReminder ? { day: String(lastReminder.day), status: String(lastReminder.status), at: lastReminder.sentAt instanceof Date ? lastReminder.sentAt.toISOString() : null } : null,
      },
      days: [...dayMap.entries()].map(([day, v]) => ({ day, ...v })),
      chapters: chapterAgg.map((c) => ({
        subject: String(c._id.subject), chapter: String(c._id.chapter), attempted: c.attempted as number, correct: c.correct as number,
        accuracy: c.attempted > 0 ? Math.round(((c.correct as number) / (c.attempted as number)) * 100) : 0,
      })),
      recent,
      drills: drillDocs.map((d) => ({
        startedAt: d.startedAt instanceof Date ? d.startedAt.toISOString() : null,
        submittedAt: d.submittedAt instanceof Date ? d.submittedAt.toISOString() : null,
        score: d.result?.score ?? null, maxScore: d.result?.maxScore ?? null, correct: d.result?.correct ?? null,
        wrong: d.result?.wrong ?? null, skipped: d.result?.skipped ?? null, timeTakenSec: d.result?.timeTakenSec ?? null,
      })),
    };
  });
