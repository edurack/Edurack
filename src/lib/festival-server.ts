// Server-only storage for the festival sale switch: one document in `siteSettings` ({ key: "festival" }).
// Edited from the admin portal (server-functions/festival.ts); read here by everything that sets a price.
import type { Db } from "@/lib/pyq-server";
import { cleanFestivalSettings, type FestivalSettings } from "@/lib/festival";

/** The current settings, straight from the database (no cache: checkout must never charge from a stale switch). Never throws: on any error the sale is OFF. */
export async function readFestivalSettings(db: Db): Promise<FestivalSettings> {
  try {
    const col = db.collection("siteSettings");
    // `?? "diwali"`: the document was called "diwali" before there was more than one festival; keep honouring it until the first save under the new name.
    return cleanFestivalSettings((await col.findOne({ key: "festival" })) ?? (await col.findOne({ key: "diwali" })));
  } catch {
    return cleanFestivalSettings(null);
  }
}

export async function writeFestivalSettings(db: Db, settings: FestivalSettings): Promise<void> {
  await db
    .collection("siteSettings")
    .updateOne({ key: "festival" }, { $set: { key: "festival", enabled: settings.enabled, theme: settings.theme, discountPercent: settings.discountPercent, endsAt: new Date(settings.endsAt), updatedAt: new Date() } }, { upsert: true });
}
