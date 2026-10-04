// "Report a question": students flag a wrong answer / unclear solution / typo
// on a PYQ, admins work through a queue grouped by question.
//
// requireAdmin is deliberately duplicated here rather than imported — the same
// convention as blog-admin.ts / promoter-admin.ts (sharing it across
// server-function files previously broke client-bundle stripping).
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { eligibleBundleIds, practiceKeysFor } from "@/lib/pyq-server";
import {
  REPORT_REASONS,
  type OptionKey,
  type QuestionReportGroup,
  type ReportReason,
  type ReportStatus,
} from "@/lib/pyq-types";

async function requireSignedIn(token: string) {
  return adminAuth.verifyIdToken(token);
}
async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error("Forbidden: admin access required");
  return decoded;
}

const OID = /^[a-f0-9]{24}$/i;
const MAX_NOTE = 500;
const MAX_PER_DAY = 15;

// ─── Student side ──────────────────────────────────────────────────────────
export const reportQuestion = createServerFn({ method: "POST" })
  .validator((data: { token: string; questionId: string; reason: ReportReason; note?: string }) => data)
  .handler(async ({ data }): Promise<{ ok: true; updated: boolean }> => {
    const decoded = await requireSignedIn(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");

    if (!REPORT_REASONS.includes(data.reason)) throw new Error("Pick a reason for the report.");
    if (!OID.test(data.questionId)) throw new Error("Question not found.");
    const note = String(data.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
    if (data.reason === "other" && note.length < 5) throw new Error("Please tell us a little about the problem.");

    // Only questions a student can legitimately see (PYQs in our own batches).
    const q = await db.collection("questions").findOne({ _id: new ObjectId(data.questionId) });
    if (!q || q.isPYQ !== true || !(await eligibleBundleIds(db)).includes(String(q.bundleId))) throw new Error("Question not found.");

    const col = db.collection("questionReports");
    const now = new Date();
    // One open report per student per question — re-reporting just updates it.
    const open = await col.findOne({ uid: decoded.uid, questionId: data.questionId, status: "open" });
    if (open) {
      await col.updateOne({ _id: open._id }, { $set: { reason: data.reason, note, updatedAt: now } });
      return { ok: true, updated: true };
    }
    const today = await col.countDocuments({ uid: decoded.uid, createdAt: { $gte: new Date(now.getTime() - 86_400_000) } });
    if (today >= MAX_PER_DAY) throw new Error("You've sent a lot of reports today. Thank you — we'll review them first.");

    const k = await practiceKeysFor(db, q);
    await col.insertOne({
      uid: decoded.uid,
      questionId: data.questionId,
      reason: data.reason,
      note,
      status: "open" as ReportStatus,
      source: "pyq",
      snapshot: { subject: k.subject, chapter: String(q.chapter ?? ""), exam: k.exam },
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, updated: false };
  });

// ─── Admin side ────────────────────────────────────────────────────────────
export const listQuestionReports = createServerFn({ method: "GET" })
  .validator((data: { token: string; status?: ReportStatus | "all" }) => data)
  .handler(async ({ data }): Promise<{ groups: QuestionReportGroup[]; openTotal: number }> => {
    await requireAdmin(data.token);
    const db = await getDb();
    const { ObjectId } = await import("mongodb");

    const rows = await db.collection("questionReports").find({}).sort({ createdAt: -1 }).limit(1000).toArray();
    const openTotal = rows.filter((r) => r.status === "open").length;
    const wanted = data.status ?? "open";
    const shown = wanted === "all" ? rows : rows.filter((r) => r.status === wanted);

    const byQ = new Map<string, typeof rows>();
    for (const r of shown) (byQ.get(r.questionId as string) ?? byQ.set(r.questionId as string, []).get(r.questionId as string)!).push(r);

    const ids = [...byQ.keys()].filter((id) => OID.test(id));
    const docs = ids.length ? await db.collection("questions").find({ _id: { $in: ids.map((i) => new ObjectId(i)) } }).toArray() : [];
    const qById = new Map(docs.map((d) => [String(d._id), d]));
    const bundles = await db.collection("bundles").find({ _id: { $in: [...new Set(docs.map((d) => String(d.bundleId)).filter((i) => OID.test(i)))].map((i) => new ObjectId(i)) } }).toArray();
    const tests = await db.collection("testCores").find({ _id: { $in: [...new Set(docs.map((d) => String(d.testId)).filter((i) => OID.test(i)))].map((i) => new ObjectId(i)) } }).toArray();
    const bundleTitle = new Map(bundles.map((b) => [String(b._id), String(b.title ?? "")]));
    const testName = new Map(tests.map((t) => [String(t._id), String(t.name ?? "")]));

    const groups: QuestionReportGroup[] = [...byQ.entries()].map(([questionId, rs]) => {
      const d = qById.get(questionId);
      const reasons: QuestionReportGroup["reasons"] = {};
      for (const r of rs) reasons[r.reason as ReportReason] = (reasons[r.reason as ReportReason] ?? 0) + 1;
      return {
        questionId,
        openCount: rs.filter((r) => r.status === "open").length,
        totalCount: rs.length,
        latestAt: new Date(Math.max(...rs.map((r) => new Date(r.createdAt as Date).getTime()))).toISOString(),
        reasons,
        notes: rs
          .filter((r) => String(r.note ?? "").trim())
          .slice(0, 5)
          .map((r) => ({ reason: r.reason as ReportReason, note: String(r.note), at: new Date(r.createdAt as Date).toISOString() })),
        question: d
          ? {
              subject: String(d.subject ?? ""),
              chapter: String(d.chapter ?? ""),
              topic: String(d.topic ?? ""),
              difficulty: String(d.difficulty ?? ""),
              type: (d.type as "mcq" | "integer") ?? "mcq",
              body: String(d.body ?? ""),
              options: d.type === "integer" ? undefined : (d.options as Record<OptionKey, string> | undefined),
              correctOption: d.correctOption as OptionKey | undefined,
              correctAnswer: d.correctAnswer as number | undefined,
              solution: String(d.solution ?? ""),
              where: [bundleTitle.get(String(d.bundleId)), testName.get(String(d.testId))].filter(Boolean).join(" › "),
            }
          : null,
      };
    });
    // Most-reported first: a question three students flagged beats one flagged once.
    groups.sort((a, b) => b.openCount - a.openCount || b.latestAt.localeCompare(a.latestAt));
    return { groups, openTotal };
  });

export const resolveQuestionReports = createServerFn({ method: "POST" })
  .validator((data: { token: string; questionId: string; status: ReportStatus; adminNote?: string }) => data)
  .handler(async ({ data }): Promise<{ updated: number }> => {
    const decoded = await requireAdmin(data.token);
    const db = await getDb();
    if (!["open", "fixed", "dismissed"].includes(data.status)) throw new Error("Invalid status.");
    if (!OID.test(data.questionId)) throw new Error("Question not found.");
    const now = new Date();
    const adminNote = String(data.adminNote ?? "").trim().slice(0, 500);
    const filter = data.status === "open" ? { questionId: data.questionId, status: { $ne: "open" } } : { questionId: data.questionId, status: "open" };
    const res = await db.collection("questionReports").updateMany(filter, {
      $set: { status: data.status, updatedAt: now, ...(data.status === "open" ? {} : { resolvedAt: now, resolvedBy: decoded.uid, adminNote }) },
    });
    return { updated: res.modifiedCount };
  });
