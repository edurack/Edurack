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
    return getReferralSummary(await getDb(), decoded.uid);
  });

/** Called once, right after a new student finishes sign-up with a friend's link. Never throws for a bad code: a referral is a bonus, not a requirement. */
export const claimReferral = createServerFn({ method: "POST" })
  .validator((data: { token: string; code: string }) => data)
  .handler(async ({ data }): Promise<{ applied: boolean }> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const res = await claim(await getDb(), decoded.uid, data.code);
    return { applied: res.applied };
  });
