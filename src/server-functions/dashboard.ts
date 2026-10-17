// One request for everything the student dashboard needs on load.
//
// Before: the page fired ~9 separate server-function calls in parallel. On a
// serverless host each of those can land on its own cold instance (own
// firebase-admin init, own Mongo connect) and each re-verified the token.
// Now: one call → one instance, one token verification, one profile read
// (shared with the bundle filter), and the same queries run concurrently
// inside that single instance.
//
// The queries themselves live in lib/dashboard-core.ts and are the same ones
// the individual server functions (getProfile, listPublicBundles, …) use, so
// results are identical.
//
// Each section fails independently: if one query throws, that section comes
// back as null (and is logged server-side) instead of taking the whole
// dashboard down. A bad/expired token still rejects the whole call.
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import {
  listBundlesForStudent,
  listLiveSoldTests,
  listMentorDirectory,
  listMentorshipBatches,
  loadMyBatchPerformance,
  loadMyBookedSessions,
  loadMyPurchases,
  loadOpenMentorSessions,
  loadProfile,
} from "@/lib/dashboard-core";

// Per-section wall-clock timing, logged as one JSON line per request so slow
// sections can be found in Vercel Logs. Durations only — no tokens, uids or data.
function timed<T>(timings: Record<string, number>, name: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  return run().finally(() => {
    timings[name] = Math.round(performance.now() - t0);
  });
}

function settled<T>(name: string, r: PromiseSettledResult<T>): T | null {
  if (r.status === "fulfilled") return r.value;
  console.error(`[dashboard-bootstrap] ${name} failed:`, r.reason);
  return null;
}

// POST on purpose: the Firebase ID token must not travel in the URL.
export const getDashboardBootstrap = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const decoded = await timed(timings, "verifyToken", () => adminAuth.verifyIdToken(data.token));
    const uid = decoded.uid;
    const db = await timed(timings, "getDb", () => getDb());

    const profileP = timed(timings, "profile", () => loadProfile(db, uid));
    // Bundle visibility depends on the student's CUET subjects — reuse the
    // profile read instead of querying it a second time. (Its time includes
    // waiting for the profile read.)
    const bundlesP = profileP.then(({ profile }) =>
      timed(timings, "bundles", () => listBundlesForStudent(db, new Set(profile?.cuetDomainSubjects ?? []))),
    );

    const [profile, bundles, batches, mentors, soldTests, purchases, sessions, bookings, performance] =
      await Promise.allSettled([
        profileP,
        bundlesP,
        timed(timings, "batches", () => listMentorshipBatches(db)),
        timed(timings, "mentors", () => listMentorDirectory(db)),
        timed(timings, "soldTests", () => listLiveSoldTests(db)),
        timed(timings, "purchases", () => loadMyPurchases(db, uid)),
        timed(timings, "sessions", () => loadOpenMentorSessions()),
        timed(timings, "bookings", () => loadMyBookedSessions(uid)),
        timed(timings, "performance", () => loadMyBatchPerformance(db, uid)),
      ]);

    console.log(JSON.stringify({ at: "dashboard-bootstrap", totalMs: Math.round(performance.now() - t0), ...timings }));

    return {
      profile: settled("profile", profile),
      bundles: settled("bundles", bundles),
      batches: settled("batches", batches),
      mentors: settled("mentors", mentors),
      soldTests: settled("soldTests", soldTests),
      purchases: settled("purchases", purchases),
      sessions: settled("sessions", sessions),
      bookings: settled("bookings", bookings),
      performance: settled("performance", performance),
    };
  });
