import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { eligibleBundleIds } from "@/lib/pyq-server";

/** Read-only, admin-only NEET PYQ analytics sourced from existing question documents. */
export const getAdminNeetQuestionAnalytics = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    if (decoded.admin !== true) throw new Error("Forbidden: admin access required");

    const db = await getDb();
    const bundleIds = await eligibleBundleIds(db, "neet");
    if (!bundleIds.length) {
      return { rows: [], totalQuestions: 0, generatedAt: new Date().toISOString() };
    }

    const rows = await db.collection("questions").aggregate([
      {
        $match: {
          isPYQ: true,
          bundleId: { $in: bundleIds },
        },
      },
      {
        $project: {
          subject: { $ifNull: ["$subject", "Unassigned"] },
          chapter: {
            $let: {
              vars: { value: { $trim: { input: { $toString: { $ifNull: ["$chapter", ""] } } } } },
              in: { $cond: [{ $eq: ["$$value", ""] }, "Unassigned chapter", "$$value"] },
            },
          },
          topic: {
            $let: {
              vars: { value: { $trim: { input: { $toString: { $ifNull: ["$topic", ""] } } } } },
              in: { $cond: [{ $eq: ["$$value", ""] }, "Unassigned topic", "$$value"] },
            },
          },
          year: { $toString: { $ifNull: ["$pyqYear", "Unspecified year"] } },
          difficulty: {
            $switch: {
              branches: [
                { case: { $eq: [{ $toLower: { $ifNull: ["$difficulty", ""] } }, "easy"] }, then: "Easy" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$difficulty", ""] } }, "medium"] }, then: "Medium" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$difficulty", ""] } }, "hard"] }, then: "Hard" },
              ],
              default: "Unclassified",
            },
          },
        },
      },
      {
        $group: {
          _id: {
            subject: "$subject",
            chapter: "$chapter",
            topic: "$topic",
            year: "$year",
            difficulty: "$difficulty",
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          subject: "$_id.subject",
          chapter: "$_id.chapter",
          topic: "$_id.topic",
          year: "$_id.year",
          difficulty: "$_id.difficulty",
          count: 1,
        },
      },
      { $sort: { subject: 1, chapter: 1, topic: 1, year: 1, difficulty: 1 } },
    ]).toArray();

    return {
      rows: rows.map((row) => ({
        subject: String(row.subject),
        chapter: String(row.chapter),
        topic: String(row.topic),
        year: String(row.year),
        difficulty: String(row.difficulty),
        count: Number(row.count ?? 0),
      })),
      totalQuestions: rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
      generatedAt: new Date().toISOString(),
    };
  });
