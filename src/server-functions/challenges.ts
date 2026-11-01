import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { createChallenge, getChallengeView, joinChallenge as join } from "@/lib/challenge-server";
import type { ChallengeView } from "@/lib/challenge";

async function uidOf(token: string): Promise<string> {
  return (await adminAuth.verifyIdToken(token)).uid;
}

/** Makes a finished Quick Mock into a challenge. Also returns the sharer's referral code, so the link can carry it. */
export const createChallengeFromDrill = createServerFn({ method: "POST" })
  .validator((data: { token: string; drillId: string }) => data)
  .handler(async ({ data }): Promise<{ code: string; refCode: string | null }> => {
    const uid = await uidOf(data.token);
    const db = await getDb();
    const { code } = await createChallenge(db, uid, data.drillId);
    const { getOrCreateReferralCode } = await import("@/lib/referral-server");
    return { code, refCode: await getOrCreateReferralCode(db, uid).catch(() => null) };
  });

/** The challenge page. Works without signing in (a friend opening the link); signing in adds "your" status and, once they took part, the scoreboard. */
export const getChallenge = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; code: string }) => data)
  .handler(async ({ data }): Promise<ChallengeView | null> => {
    const uid = data.token ? await uidOf(data.token).catch(() => null) : null;
    return getChallengeView(await getDb(), data.code, uid);
  });

export const joinChallenge = createServerFn({ method: "POST" })
  .validator((data: { token: string; code: string }) => data)
  .handler(async ({ data }): Promise<{ drillId: string }> => {
    const uid = await uidOf(data.token);
    return join(await getDb(), uid, data.code);
  });
