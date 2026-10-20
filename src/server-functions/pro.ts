// What a student can do with timed drills right now: how many free drills they've used today, whether Pro is
// active, and the plans on sale. Rules live in lib/pro.ts; storage in lib/pro-server.ts.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import type { DrillAccess } from "@/lib/pro";

export const getDrillAccess = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<DrillAccess> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const { getDrillAccess: access } = await import("@/lib/pro-server");
    return access(await getDb(), decoded.uid);
  });

/** Paper years that have PYQs for this student's exam, newest first — the options for the drill builder's year filter. */
export const getDrillBuilderYears = createServerFn({ method: "POST" })
  .validator((data: { token: string; exam?: string }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const { pyqMatch, resolveExam } = await import("@/lib/pyq-server");
    const db = await getDb();
    const exam = await resolveExam(db, decoded.uid, data.exam);
    const years = (await db.collection("questions").distinct("pyqYear", await pyqMatch(db, exam))) as unknown[];
    return years.filter((y): y is string => typeof y === "string" && /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
  });
