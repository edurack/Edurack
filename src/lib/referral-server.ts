// SERVER-ONLY. Student referrals (rules in lib/referral.ts).
//
//   profiles.referralCode / referredBy                      : a student's own code and who invited them.
//   profiles.referralBonusUntil                             : LEGACY +1 free Quick Mock a day, honoured until it expires.
//   proGrants { source: "gift", via: "referral", ... }      : the reward itself, REFERRAL_PRO_DAYS of Pro for each student.
//   referrals { referrerUid, refereeUid (unique), code, refereeMobile, status, createdAt, rewardedAt }
//        status: pending -> rewarding -> rewarded | rejected   (a status change is claimed atomically, so a reward is paid once)
import { randomInt } from "node:crypto";
import type { Db } from "@/lib/pyq-server";
import { REFERRAL_BONUS_PER_DAY, REFERRAL_CLAIM_WINDOW_DAYS, REFERRAL_MAX_REWARDS, REFERRAL_PRO_DAYS, isValidReferralCode, normalizeReferralCode, type ReferralStatus, type ReferralSummary } from "@/lib/referral";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PLACEHOLDER_MOBILE = "0000000000"; // what older accounts hold when they never gave a number
let indexed = false;
// Testing aid: set REFERRAL_ALLOW_SAME_MOBILE=1 to try the whole flow with accounts that share one phone number.
const allowSameMobile = () => process.env.REFERRAL_ALLOW_SAME_MOBILE === "1";

async function ensureReferralIndexes(db: Db) {
  if (indexed) return;
  indexed = true;
  try {
    await db.collection("profiles").createIndex({ referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: "string" } } });
    await db.collection("referrals").createIndex({ refereeUid: 1 }, { unique: true });
    await db.collection("referrals").createIndex({ referrerUid: 1, status: 1 });
  } catch (err) {
    console.error("[referral] couldn't create indexes:", err);
  }
}

const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** The student's own invite code, created on first use. Null if they have no profile yet. */
export async function getOrCreateReferralCode(db: Db, uid: string): Promise<string | null> {
  await ensureReferralIndexes(db);
  const profile = await db.collection("profiles").findOne({ uid }, { projection: { referralCode: 1 } });
  if (!profile) return null;
  if (typeof profile.referralCode === "string" && profile.referralCode) return profile.referralCode;
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    try {
      const res = await db.collection("profiles").updateOne({ uid, referralCode: { $exists: false } }, { $set: { referralCode: code } });
      if (res.matchedCount === 0) {
        const again = await db.collection("profiles").findOne({ uid }, { projection: { referralCode: 1 } });
        return typeof again?.referralCode === "string" ? again.referralCode : null;
      }
      return code;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // that code is taken: draw another
      throw err;
    }
  }
  return null;
}

export async function getReferralSummary(db: Db, uid: string): Promise<Omit<ReferralSummary, "offerActive">> {
  const code = await getOrCreateReferralCode(db, uid);
  const [invited, pending, rewarded, profile, mine] = await Promise.all([
    db.collection("referrals").countDocuments({ referrerUid: uid, status: { $ne: "rejected" } }),
    db.collection("referrals").countDocuments({ referrerUid: uid, status: { $in: ["pending", "rewarding"] } }),
    db.collection("referrals").countDocuments({ referrerUid: uid, status: "rewarded" }),
    db.collection("profiles").findOne({ uid }, { projection: { referralBonusUntil: 1, createdAt: 1, referredBy: 1 } }),
    db.collection("referrals").findOne({ refereeUid: uid }, { projection: { status: 1, reason: 1 } }),
  ]);
  const until = profile?.referralBonusUntil instanceof Date ? profile.referralBonusUntil : null;
  const createdMs = profile?.createdAt instanceof Date ? profile.createdAt.getTime() : 0;
  const isNewAccount = Date.now() - createdMs <= REFERRAL_CLAIM_WINDOW_DAYS * 86_400_000;
  return {
    code,
    invited,
    pending,
    rewarded,
    bonusUntil: until && until.getTime() > Date.now() ? until.toISOString() : null,
    mine: mine ? { status: mine.status as ReferralStatus, ...(mine.reason ? { reason: String(mine.reason) } : {}) } : null,
    canClaim: !mine && !profile?.referredBy && isNewAccount,
  };
}

/** The extra free Quick Mocks a day this student has right now from referrals. */
export async function getReferralBonus(db: Db, uid: string, now = new Date()): Promise<{ perDay: number; until: Date | null }> {
  const profile = await db.collection("profiles").findOne({ uid }, { projection: { referralBonusUntil: 1 } });
  const until = profile?.referralBonusUntil instanceof Date ? profile.referralBonusUntil : null;
  return until && until.getTime() > now.getTime() ? { perDay: REFERRAL_BONUS_PER_DAY, until } : { perDay: 0, until: null };
}

/**
 * A new student used someone's link or typed their code. Recorded as "pending" for a genuinely new account; the reward comes
 * after their first finished Quick Mock. When it can't count (same phone number, account too old) the attempt is stored as
 * "rejected" with the reason, so the student is told why instead of the bonus silently not arriving.
 */
export async function claimReferral(db: Db, refereeUid: string, rawCode: unknown): Promise<{ applied: boolean; reason?: string }> {
  const code = typeof rawCode === "string" ? normalizeReferralCode(rawCode) : "";
  if (!isValidReferralCode(code)) return { applied: false, reason: "invalid" };
  await ensureReferralIndexes(db);
  const referee = await db.collection("profiles").findOne({ uid: refereeUid }, { projection: { createdAt: 1, mobile: 1, referredBy: 1 } });
  if (!referee || referee.referredBy) return { applied: false, reason: "not_eligible" };
  if (await db.collection("referrals").findOne({ refereeUid }, { projection: { _id: 1 } })) return { applied: false, reason: "already_claimed" };
  const referrer = await db.collection("profiles").findOne({ referralCode: code }, { projection: { uid: 1, mobile: 1 } });
  if (!referrer || referrer.uid === refereeUid) return { applied: false, reason: "unknown_code" };

  const base = { referrerUid: referrer.uid, refereeUid, code, refereeMobile: referee.mobile ?? "", createdAt: new Date() };
  const reject = async (reason: string) => {
    try {
      await db.collection("referrals").insertOne({ ...base, status: "rejected", reason });
    } catch {
      /* already recorded */
    }
    return { applied: false, reason };
  };
  const created = referee.createdAt instanceof Date ? referee.createdAt.getTime() : 0;
  if (Date.now() - created > REFERRAL_CLAIM_WINDOW_DAYS * 86_400_000) return reject("not_new"); // only brand-new accounts can be referred
  if (!allowSameMobile() && referrer.mobile && referrer.mobile !== PLACEHOLDER_MOBILE && referrer.mobile === referee.mobile) return reject("same_mobile");
  try {
    await db.collection("referrals").insertOne({ ...base, status: "pending" });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { applied: false, reason: "already_claimed" };
    throw err;
  }
  await db.collection("profiles").updateOne({ uid: refereeUid }, { $set: { referredBy: referrer.uid } });
  return { applied: true };
}

/** Gives one student the reward: Pro days, recorded once per (referral, student) through the unique payment id. */
export type GrantProDays = (uid: string, referralKey: string, days: number) => Promise<void>;

/** Called when a student finishes a Quick Mock. If they came through a friend's link and this is their first, both get Pro days. */
export async function rewardReferralFor(db: Db, refereeUid: string, now = new Date(), grant?: GrantProDays): Promise<void> {
  const ref = await db.collection("referrals").findOne({ refereeUid, status: "pending" });
  if (!ref) return;
  // Claim it atomically so two quick submits can't pay twice.
  const claim = await db.collection("referrals").updateOne({ _id: ref._id, status: "pending" }, { $set: { status: "rewarding", updatedAt: now } });
  if (claim.modifiedCount !== 1) return;

  const mobile = String(ref.refereeMobile ?? "");
  const duplicate = !allowSameMobile() && mobile && mobile !== PLACEHOLDER_MOBILE ? await db.collection("referrals").findOne({ refereeMobile: mobile, status: "rewarded", refereeUid: { $ne: refereeUid } }) : null;
  if (duplicate) {
    await db.collection("referrals").updateOne({ _id: ref._id }, { $set: { status: "rejected", reason: "duplicate_mobile", updatedAt: now } });
    return;
  }

  const give: GrantProDays = grant ?? (async (uid, key, days) => {
    const { grantProPlan } = await import("@/lib/pro-server");
    await grantProPlan(db, { uid, planId: "referral", planName: "Referral bonus", durationDays: days, orderId: "referral", paymentId: `referral_${key}_${uid}`, amount: 0, extra: { source: "gift", via: "referral" } }, now);
  });
  const key = String(ref._id);
  await give(refereeUid, key, REFERRAL_PRO_DAYS); // the friend always gets theirs
  const referrerRewards = await db.collection("referrals").countDocuments({ referrerUid: ref.referrerUid, status: "rewarded" });
  if (referrerRewards < REFERRAL_MAX_REWARDS) await give(ref.referrerUid as string, key, REFERRAL_PRO_DAYS);
  await db.collection("referrals").updateOne({ _id: ref._id }, { $set: { status: "rewarded", rewardedAt: now, updatedAt: now, proDays: REFERRAL_PRO_DAYS } });
}
