import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { claimReferral as claim, getReferralSummary } from "@/lib/referral-server";
import type { ReferralSummary } from "@/lib/referral";

/** The signed-in student's invite code, how many friends joined and when their bonus runs until. */
export const getMyReferral = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<ReferralSummary> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    const base = await getReferralSummary(db, decoded.uid);
    // The reward is Pro days, so it only means something while Pro is on sale (a plan is published); until then every feature is free.
    const { getDrillAccess } = await import("@/lib/pro-server");
    const access = await getDrillAccess(db, decoded.uid);
    return { ...base, offerActive: access.gatingOn };
  });

/** Right after sign-up with a friend's link, or when a new student types a friend's code. Never throws for a bad code: a referral is a bonus, not a requirement. */
export const claimReferral = createServerFn({ method: "POST" })
  .validator((data: { token: string; code: string }) => data)
  .handler(async ({ data }): Promise<{ applied: boolean; reason?: string }> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const res = await claim(await getDb(), decoded.uid, data.code);
    return { applied: res.applied, reason: res.reason };
  });
