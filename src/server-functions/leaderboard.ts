// Weekly PYQ leaderboard + "Student of the week" shout-out. Rules live in lib/leaderboard.ts,
// reads in lib/leaderboard-server.ts.
//
// Privacy: a student appears ONLY after opting in with a nickname (many are under 18, so no real
// names, photos or contact details are ever shown). The team can hide a nickname, and can feature a
// student only if they have opted in. The board is for signed-in students; only the team-published
// shout-out (nickname + message) is public.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { requireTeamAdmin } from "@/lib/team-core";
import {
  MIN_ACCURACY,
  MIN_ATTEMPTED,
  TOP_N,
  accuracyPct,
  cleanDisplayName,
  compareScores,
  isEligible,
  positionAmong,
  rankScores,
  windowFor,
  type Week,
} from "@/lib/leaderboard";
import type { PublicFeatured } from "@/lib/leaderboard-server";

export type LeaderboardRow = { rank: number; name: string; solved: number; accuracy: number; isYou: boolean };
export type MyStanding = {
  solved: number;
  attempted: number;
  accuracy: number;
  eligible: boolean;
  /** Attempts still needed to be ranked; 0 when eligible or when accuracy is the blocker. */
  attemptsNeeded: number;
  optedIn: boolean;
  displayName: string;
  /** Where they stand among students who appear on the board; null until eligible. */
  position: number | null;
};
export type LeaderboardPayload = {
  week: Week;
  weekLabel: string;
  top: LeaderboardRow[];
  participants: number;
  me: MyStanding;
  featured: PublicFeatured | null;
  rules: { minAttempted: number; minAccuracyPct: number };
};

export const getWeeklyLeaderboard = createServerFn({ method: "POST" })
  .validator((data: { token: string; week: Week }) => data)
  .handler(async ({ data }): Promise<LeaderboardPayload> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const week: Week = data.week === "last" ? "last" : "current";
    const { weeklyScores, visiblePrefs, getPrefs, currentFeatured } = await import("@/lib/leaderboard-server");
    const db = await getDb();
    const win = windowFor(week);

    const [scores, myPrefs, featured] = await Promise.all([weeklyScores(db, win), getPrefs(db, decoded.uid), currentFeatured(db)]);
    const ranked = rankScores(scores);
    const names = await visiblePrefs(db, ranked.slice(0, 500).map((r) => r.uid));

    const visible = ranked.filter((r) => names.has(r.uid));
    // Rank among students who appear, so the numbers on screen have no gaps.
    const top: LeaderboardRow[] = visible.slice(0, TOP_N).map((r) => ({
      rank: 1 + visible.filter((v) => compareScores(v, r) < 0 && !(v.solved === r.solved && v.attempted === r.attempted)).length,
      name: names.get(r.uid)!,
      solved: r.solved,
      accuracy: accuracyPct(r),
      isYou: r.uid === decoded.uid,
    }));

    const mine = scores.find((s) => s.uid === decoded.uid) ?? { uid: decoded.uid, solved: 0, attempted: 0 };
    const eligible = isEligible(mine);
    const me: MyStanding = {
      solved: mine.solved,
      attempted: mine.attempted,
      accuracy: accuracyPct(mine),
      eligible,
      attemptsNeeded: Math.max(0, MIN_ATTEMPTED - mine.attempted),
      optedIn: Boolean(myPrefs?.optIn && myPrefs.displayName && !myPrefs.hidden),
      displayName: myPrefs?.displayName ?? "",
      position: eligible ? positionAmong(mine, visible) : null,
    };

    return { week, weekLabel: win.label, top, participants: visible.length, me, featured, rules: { minAttempted: MIN_ATTEMPTED, minAccuracyPct: Math.round(MIN_ACCURACY * 100) } };
  });

export const saveLeaderboardPrefs = createServerFn({ method: "POST" })
  .validator((data: { token: string; optIn: boolean; displayName: string }) => data)
  .handler(async ({ data }): Promise<{ ok: true; displayName: string }> => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const optIn = data.optIn === true;
    const name = cleanDisplayName(String(data.displayName ?? ""));
    if (optIn && !name) throw new Error("Pick a nickname of 2–24 letters or numbers. No phone numbers, emails or links.");

    const db = await getDb();
    await db.collection("leaderboardPrefs").updateOne(
      { uid: decoded.uid },
      {
        $set: { uid: decoded.uid, optIn, ...(name ? { displayName: name } : {}), updatedAt: new Date() },
        $setOnInsert: { hidden: false, createdAt: new Date() },
      },
      { upsert: true },
    );
    // Opting out also takes down any shout-out that used the nickname.
    if (!optIn) {
      const { forgetFeatured } = await import("@/lib/leaderboard-server");
      await db.collection("studentOfTheWeek").deleteMany({ uid: decoded.uid });
      forgetFeatured();
    }
    return { ok: true, displayName: name ?? "" };
  });

/** Public: the team's current shout-out (nickname + message), or null. */
export const getStudentOfTheWeek = createServerFn({ method: "GET" }).handler(async (): Promise<PublicFeatured | null> => {
  const { currentFeatured } = await import("@/lib/leaderboard-server");
  return currentFeatured(await getDb());
});

// ── Team (admin) ─────────────────────────────────────────────────────────

export type Candidate = {
  rank: number;
  uid: string;
  fullName: string;
  email: string;
  solved: number;
  attempted: number;
  accuracy: number;
  optedIn: boolean;
  hidden: boolean;
  displayName: string;
};
export type AdminLeaderboard = {
  week: Week;
  weekKey: string;
  weekLabel: string;
  candidates: Candidate[];
  featured: (PublicFeatured & { weekKey: string; uid: string }) | null;
};

export const adminGetLeaderboard = createServerFn({ method: "POST" })
  .validator((data: { token: string; week: Week }) => data)
  .handler(async ({ data }): Promise<AdminLeaderboard> => {
    await requireTeamAdmin(data.token);
    const week: Week = data.week === "current" ? "current" : "last";
    const { weeklyScores } = await import("@/lib/leaderboard-server");
    const db = await getDb();
    const win = windowFor(week);

    const ranked = rankScores(await weeklyScores(db, win)).slice(0, 25);
    const uids = ranked.map((r) => r.uid);
    const [profiles, prefs, featured] = await Promise.all([
      db.collection("profiles").find({ uid: { $in: uids } }, { projection: { uid: 1, fullName: 1, email: 1 } }).toArray(),
      db.collection("leaderboardPrefs").find({ uid: { $in: uids } }).toArray(),
      db.collection("studentOfTheWeek").findOne({ weekStart: win.startKey }),
    ]);
    const profileBy = new Map(profiles.map((p) => [String(p.uid), p]));
    const prefBy = new Map(prefs.map((p) => [String(p.uid), p]));

    return {
      week,
      weekKey: win.startKey,
      weekLabel: win.label,
      candidates: ranked.map((r) => {
        const p = profileBy.get(r.uid);
        const pr = prefBy.get(r.uid);
        return {
          rank: r.rank,
          uid: r.uid,
          fullName: String(p?.fullName ?? ""),
          email: String(p?.email ?? ""),
          solved: r.solved,
          attempted: r.attempted,
          accuracy: accuracyPct(r),
          optedIn: pr?.optIn === true && Boolean(String(pr?.displayName ?? "").trim()),
          hidden: pr?.hidden === true,
          displayName: String(pr?.displayName ?? ""),
        };
      }),
      featured: featured ? { weekKey: String(featured.weekStart), uid: String(featured.uid), weekLabel: String(featured.weekLabel ?? ""), displayName: String(featured.displayName ?? ""), message: String(featured.message ?? ""), solved: Number(featured.solved ?? 0), accuracy: Number(featured.accuracy ?? 0) } : null,
    };
  });

/** Publish (or replace) the shout-out for a week. The student must have opted in; their nickname is used, never a typed name. */
export const adminFeatureStudent = createServerFn({ method: "POST" })
  .validator((data: { token: string; week: Week; uid: string; message: string }) => data)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await requireTeamAdmin(data.token);
    const message = String(data.message ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
    if (message.length < 10) throw new Error("Write a short shout-out (at least 10 characters).");

    const { weeklyScores, getPrefs, forgetFeatured } = await import("@/lib/leaderboard-server");
    const db = await getDb();
    const win = windowFor(data.week === "current" ? "current" : "last");

    const prefs = await getPrefs(db, data.uid);
    if (!prefs?.optIn || !prefs.displayName || prefs.hidden) throw new Error("This student hasn't opted in to appear on the platform (or is hidden). Ask them to turn it on first.");
    const score = rankScores(await weeklyScores(db, win)).find((r) => r.uid === data.uid);
    if (!score) throw new Error("This student isn't eligible for that week.");

    await db.collection("studentOfTheWeek").updateOne(
      { weekStart: win.startKey },
      {
        $set: {
          weekStart: win.startKey,
          weekLabel: win.label,
          uid: data.uid,
          displayName: prefs.displayName,
          message,
          solved: score.solved,
          attempted: score.attempted,
          accuracy: accuracyPct(score),
          publishedAt: new Date(),
          publishedBy: admin.email ?? admin.uid,
        },
      },
      { upsert: true },
    );
    forgetFeatured();
    return { ok: true };
  });

export const adminUnfeatureStudent = createServerFn({ method: "POST" })
  .validator((data: { token: string; weekKey: string }) => data)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireTeamAdmin(data.token);
    const { forgetFeatured } = await import("@/lib/leaderboard-server");
    await (await getDb()).collection("studentOfTheWeek").deleteOne({ weekStart: String(data.weekKey) });
    forgetFeatured();
    return { ok: true };
  });

/** Moderation: take a nickname off the board (and out of shout-outs) without deleting anything. */
export const adminSetLeaderboardHidden = createServerFn({ method: "POST" })
  .validator((data: { token: string; uid: string; hidden: boolean }) => data)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireTeamAdmin(data.token);
    await (await getDb()).collection("leaderboardPrefs").updateOne({ uid: data.uid }, { $set: { hidden: data.hidden === true, updatedAt: new Date() } }, { upsert: true });
    return { ok: true };
  });
