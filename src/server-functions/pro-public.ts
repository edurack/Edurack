// The Edurack Pro offer, readable WITHOUT signing in — the same plans and free-plan rules the mock drill page
// shows a logged-in student, so the homepage and /pro can show them to anyone. Nothing personal is in here.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import type { ProFeatureKey, ProPlanPublic } from "@/lib/pro";

export type PublicProOffer = {
  /** False until the team publishes a plan; while false nothing is limited and there is nothing to sell. */
  gatingOn: boolean;
  /** Free timed drills per day. */
  freeLimit: number;
  /** Which features are Pro-only right now (admin setting). */
  proOnly: Record<ProFeatureKey, boolean>;
  plans: ProPlanPublic[];
};

// Same for every visitor and changes only when an admin edits a plan, so a minute's delay is fine —
// and the homepage must not hit the database once per visitor.
const cache = createTtlCache<PublicProOffer>(60_000);

export const getPublicProOffer = createServerFn({ method: "GET" }).handler(async (): Promise<PublicProOffer> => {
  const hit = cache.get("offer");
  if (hit) return hit;
  const { listActivePlans, getProSettings } = await import("@/lib/pro-server");
  const db = await getDb();
  const [plans, settings] = await Promise.all([listActivePlans(db), getProSettings(db)]);
  const offer: PublicProOffer = { gatingOn: plans.length > 0, freeLimit: settings.freeDrillsPerDay, proOnly: settings.proOnly, plans };
  cache.set("offer", offer);
  return offer;
});
