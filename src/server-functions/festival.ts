// src/server-functions/festival.ts
//
// The festival (Diwali / Christmas) sale switch. `getFestivalSettings` is public (every page asks for it once; cached for a few seconds)
// and `saveFestivalSettings` is the admin-only on/off + discount + end-time editor shown in Admin → Edurack Pro.
// Own private admin check, same convention as pro-admin.ts / blog-admin.ts (requireAdmin is never imported across files).
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import { cleanFestivalSettings, MAX_FESTIVAL_DISCOUNT, MIN_FESTIVAL_DISCOUNT, type FestivalSettings } from "@/lib/festival";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

// A few seconds is plenty: the switch changes rarely, and every page load must not hit the database.
const cache = createTtlCache<FestivalSettings>(15_000);

export const getFestivalSettings = createServerFn({ method: "GET" }).handler(async (): Promise<FestivalSettings> => {
  const hit = cache.get("s");
  if (hit) return hit;
  const { readFestivalSettings } = await import("@/lib/festival-server");
  const settings = await readFestivalSettings(await getDb());
  cache.set("s", settings);
  return settings;
});

export const saveFestivalSettings = createServerFn({ method: "POST" })
  .validator((data: { token: string; settings: FestivalSettings }) => data)
  .handler(async ({ data }): Promise<{ settings: FestivalSettings }> => {
    await requireAdmin(data.token);
    const settings = cleanFestivalSettings(data.settings);
    const pct = Number(data.settings?.discountPercent);
    if (!Number.isInteger(pct) || pct < MIN_FESTIVAL_DISCOUNT || pct > MAX_FESTIVAL_DISCOUNT) {
      throw new Error(`Discount must be a whole number between ${MIN_FESTIVAL_DISCOUNT} and ${MAX_FESTIVAL_DISCOUNT}.`);
    }
    if (settings.enabled && settings.endsAt <= Date.now()) throw new Error("Pick an end time in the future to start the sale.");
    const { logAdminAction } = await import("@/lib/team-core");
    await logAdminAction(data.token, "saveFestivalSettings", settings, "Festival sale");
    const { writeFestivalSettings } = await import("@/lib/festival-server");
    await writeFestivalSettings(await getDb(), settings);
    cache.set("s", settings); // this server sees the change instantly; others within 15 seconds
    return { settings };
  });
