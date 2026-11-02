// src/server-functions/diwali.ts
//
// The Diwali sale switch. `getDiwaliSettings` is public (every page asks for it once; cached for a few seconds)
// and `saveDiwaliSettings` is the admin-only on/off + discount + end-time editor shown in Admin → Edurack Pro.
// Own private admin check, same convention as pro-admin.ts / blog-admin.ts (requireAdmin is never imported across files).
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { createTtlCache } from "@/lib/simple-cache";
import { cleanDiwaliSettings, MAX_DIWALI_DISCOUNT, MIN_DIWALI_DISCOUNT, type DiwaliSettings } from "@/lib/diwali";

async function requireAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

// A few seconds is plenty: the switch changes rarely, and every page load must not hit the database.
const cache = createTtlCache<DiwaliSettings>(15_000);

export const getDiwaliSettings = createServerFn({ method: "GET" }).handler(async (): Promise<DiwaliSettings> => {
  const hit = cache.get("s");
  if (hit) return hit;
  const { readDiwaliSettings } = await import("@/lib/diwali-server");
  const settings = await readDiwaliSettings(await getDb());
  cache.set("s", settings);
  return settings;
});

export const saveDiwaliSettings = createServerFn({ method: "POST" })
  .validator((data: { token: string; settings: DiwaliSettings }) => data)
  .handler(async ({ data }): Promise<{ settings: DiwaliSettings }> => {
    await requireAdmin(data.token);
    const settings = cleanDiwaliSettings(data.settings);
    const pct = Number(data.settings?.discountPercent);
    if (!Number.isInteger(pct) || pct < MIN_DIWALI_DISCOUNT || pct > MAX_DIWALI_DISCOUNT) {
      throw new Error(`Discount must be a whole number between ${MIN_DIWALI_DISCOUNT} and ${MAX_DIWALI_DISCOUNT}.`);
    }
    if (settings.enabled && settings.endsAt <= Date.now()) throw new Error("Pick an end time in the future to start the sale.");
    const { logAdminAction } = await import("@/lib/team-core");
    await logAdminAction(data.token, "saveDiwaliSettings", settings, "Diwali sale");
    const { writeDiwaliSettings } = await import("@/lib/diwali-server");
    await writeDiwaliSettings(await getDb(), settings);
    cache.set("s", settings); // this server sees the change instantly; others within 15 seconds
    return { settings };
  });
