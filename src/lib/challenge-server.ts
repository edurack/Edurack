// SERVER-ONLY. Friend challenges (rules in lib/challenge.ts).
//
//   challenges { code (unique), creatorUid, creatorName, exam, questionIds[], durationSec, sourceDrillId, createdAt, expiresAt }
//   pyqDrills  { ..., challengeCode }   one drill per participant; the creator's own finished drill is tagged too, so their
//                                        score is on the board. Challenge drills are not counted against the daily free limit
//                                        (see countDrillsToday), because a friend joining must never be blocked by it.
import { randomInt } from "node:crypto";
import type { Db } from "@/lib/pyq-server";
import {
  CHALLENGES_PER_DAY,
  CHALLENGE_MAX_PARTICIPANTS,
  CHALLENGE_TTL_DAYS,
  displayFirstName,
  isValidChallengeCode,
  normalizeChallengeCode,
  rankEntries,
  type ChallengeEntry,
  type ChallengeView,
} from "@/lib/challenge";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const OID = /^[a-f0-9]{24}$/i;
const DAY = 86_400_000;
let indexed = false;

async function ensureIndexes(db: Db) {
  if (indexed) return;
  indexed = true;
  try {
    await db.collection("challenges").createIndex({ code: 1 }, { unique: true });
    await db.collection("challenges").createIndex({ creatorUid: 1, createdAt: -1 });
    await db.collection("pyqDrills").createIndex({ challengeCode: 1 }, { sparse: true });
  } catch (err) {
    console.error("[challenge] couldn't create indexes:", err);
  }
}

const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Turns a student's finished Quick Mock into a challenge (or returns the one it already is). */
export async function createChallenge(db: Db, uid: string, drillId: string, now = new Date()): Promise<{ code: string }> {
  if (!OID.test(drillId)) throw new Error("Quick Mock not found.");
  await ensureIndexes(db);
  const { ObjectId } = await import("mongodb");
  const drill = await db.collection("pyqDrills").findOne({ _id: new ObjectId(drillId), uid });
  if (!drill) throw new Error("Quick Mock not found.");
  if (!drill.submittedAt) throw new Error("Finish the Quick Mock first, then challenge a friend.");
  if (typeof drill.challengeCode === "string" && drill.challengeCode) return { code: drill.challengeCode };

  const today = await db.collection("challenges").countDocuments({ creatorUid: uid, createdAt: { $gte: new Date(now.getTime() - DAY) } });
  if (today >= CHALLENGES_PER_DAY) throw new Error("You have made a lot of challenges today. Try again tomorrow.");

  const profile = await db.collection("profiles").findOne({ uid }, { projection: { fullName: 1 } });
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    try {
      await db.collection("challenges").insertOne({
        code,
        creatorUid: uid,
        creatorName: displayFirstName(profile?.fullName),
        exam: drill.exam ?? null,
        questionIds: drill.questionIds,
        durationSec: drill.durationSec,
        sourceDrillId: String(drill._id),
        createdAt: now,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_DAYS * DAY),
      });
      await db.collection("pyqDrills").updateOne({ _id: drill._id }, { $set: { challengeCode: code } });
      return { code };
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // code taken: draw another
      throw err;
    }
  }
  throw new Error("Couldn't create the challenge. Try again.");
}

/** What a visitor (signed in or not) may see about a challenge. */
export async function getChallengeView(db: Db, rawCode: string, viewerUid: string | null, now = new Date()): Promise<ChallengeView | null> {
  const code = normalizeChallengeCode(rawCode);
  if (!isValidChallengeCode(code)) return null;
  const ch = await db.collection("challenges").findOne({ code });
  if (!ch) return null;
  const drills = await db.collection("pyqDrills").find({ challengeCode: code }, { projection: { uid: 1, submittedAt: 1, result: 1 } }).toArray();
  const uids = [...new Set(drills.map((d) => String(d.uid)))];
  const profiles = uids.length ? await db.collection("profiles").find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1 } }).toArray() : [];
  const nameOf = new Map(profiles.map((p) => [String(p.uid), displayFirstName(p.fullName)]));

  const all: (ChallengeEntry & { uid: string })[] = drills
    .filter((d) => d.submittedAt && d.result)
    .map((d) => {
      const r = d.result as { score: number; maxScore: number; correct: number; wrong: number; skipped: number; timeTakenSec: number };
      const uid = String(d.uid);
      return {
        uid,
        name: uid === ch.creatorUid ? String(ch.creatorName) : (nameOf.get(uid) ?? "A friend"),
        score: r.score,
        maxScore: r.maxScore,
        correct: r.correct,
        wrong: r.wrong,
        skipped: r.skipped,
        timeTakenSec: r.timeTakenSec,
        isCreator: uid === ch.creatorUid,
        isYou: viewerUid !== null && uid === viewerUid,
      };
    });
  const mine = viewerUid ? drills.find((d) => String(d.uid) === viewerUid) : undefined;
  const creatorEntry = all.find((e) => e.isCreator) ?? null;
  const took = Boolean(mine);
  // Only students who took part see the whole board; everyone else sees just the creator's score.
  const visible = took ? all : creatorEntry ? [creatorEntry] : [];
  const entries = rankEntries(visible.map(({ uid: _uid, ...e }) => e));
  return {
    code,
    exam: (ch.exam as string | null) ?? null,
    creatorName: String(ch.creatorName),
    questionCount: (ch.questionIds as string[]).length,
    durationMin: Math.round((ch.durationSec as number) / 60),
    expired: (ch.expiresAt as Date).getTime() < now.getTime(),
    full: uids.length >= CHALLENGE_MAX_PARTICIPANTS,
    creator: creatorEntry ? { score: creatorEntry.score, maxScore: creatorEntry.maxScore, timeTakenSec: creatorEntry.timeTakenSec } : null,
    entries,
    participants: uids.length,
    you: mine ? { status: mine.submittedAt ? "done" : "running", drillId: String(mine._id) } : { status: "none" },
  };
}

/** Starts (or resumes) the signed-in student's attempt at a challenge: the same questions, a fresh clock. */
export async function joinChallenge(db: Db, uid: string, rawCode: string, now = new Date()): Promise<{ drillId: string }> {
  const code = normalizeChallengeCode(rawCode);
  if (!isValidChallengeCode(code)) throw new Error("That challenge link isn't valid.");
  await ensureIndexes(db);
  const ch = await db.collection("challenges").findOne({ code });
  if (!ch) throw new Error("This challenge doesn't exist.");
  if ((ch.expiresAt as Date).getTime() < now.getTime()) throw new Error("This challenge has expired.");

  const existing = await db.collection("pyqDrills").findOne({ uid, challengeCode: code }, { projection: { _id: 1 } });
  if (existing) return { drillId: String(existing._id) };

  const participants = await db.collection("pyqDrills").distinct("uid", { challengeCode: code });
  if (participants.length >= CHALLENGE_MAX_PARTICIPANTS) throw new Error("This challenge is full.");

  // One Quick Mock at a time: an unfinished one whose clock is still running has to be finished (or run out) first.
  const running = await db.collection("pyqDrills").find({ uid, submittedAt: null }).sort({ startedAt: -1 }).limit(1).next();
  if (running && (running.startedAt as Date).getTime() + (running.durationSec as number) * 1000 > now.getTime()) {
    throw new Error("Finish your current Quick Mock first, then start the challenge.");
  }

  const res = await db.collection("pyqDrills").insertOne({
    uid,
    exam: ch.exam ?? null,
    subject: null,
    filters: null,
    questionIds: ch.questionIds,
    durationSec: ch.durationSec,
    startedAt: now,
    submittedAt: null as Date | null,
    challengeCode: code,
  });
  return { drillId: String(res.insertedId) };
}
