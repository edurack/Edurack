// Server-only storage for the Diwali sale switch: one document in `siteSettings` ({ key: "diwali" }).
// Edited from the admin portal (server-functions/diwali.ts); read here by everything that sets a price.
import type { Db } from "@/lib/pyq-server";
import { cleanDiwaliSettings, type DiwaliSettings } from "@/lib/diwali";

/** The current settings, straight from the database (no cache: checkout must never charge from a stale switch). Never throws: on any error the sale is OFF. */
export async function readDiwaliSettings(db: Db): Promise<DiwaliSettings> {
  try {
    return cleanDiwaliSettings(await db.collection("siteSettings").findOne({ key: "diwali" }));
  } catch {
    return cleanDiwaliSettings(null);
  }
}

export async function writeDiwaliSettings(db: Db, settings: DiwaliSettings): Promise<void> {
  await db
    .collection("siteSettings")
    .updateOne({ key: "diwali" }, { $set: { key: "diwali", enabled: settings.enabled, discountPercent: settings.discountPercent, endsAt: new Date(settings.endsAt), updatedAt: new Date() } }, { upsert: true });
}
