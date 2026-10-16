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

function settled<T>(name: string, r: PromiseSettledResult<T>): T | null {
  if (r.status === "fulfilled") return r.value;
  console.error(`[dashboard-bootstrap] ${name} failed:`, r.reason);
  return null;
}

// POST on purpose: the Firebase ID token must not travel in the URL.
export const getDashboardBootstrap = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const uid = decoded.uid;
    const db = await getDb();

    const profileP = loadProfile(db, uid);
    // Bundle visibility depends on the student's CUET subjects — reuse the
    // profile read instead of querying it a second time.
    const bundlesP = profileP.then(({ profile }) =>
      listBundlesForStudent(db, new Set(profile?.cuetDomainSubjects ?? [])),
    );

    const [profile, bundles, batches, mentors, soldTests, purchases, sessions, bookings, performance] =
      await Promise.allSettled([
        profileP,
        bundlesP,
        listMentorshipBatches(db),
        listMentorDirectory(db),
        listLiveSoldTests(db),
        loadMyPurchases(db, uid),
        loadOpenMentorSessions(),
        loadMyBookedSessions(uid),
        loadMyBatchPerformance(db, uid),
      ]);

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
