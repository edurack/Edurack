// Public NCERT question pages (/ncert/$id) for visitors arriving from Google.
// Returns the question text and options plus a few neighbours: same projection as the practice list, so no answer and
// no solution ever leave the server here. Only answers while NCERT is live (see lib/ncert-public-server.ts).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { ensureNcertIndexes } from "@/lib/ncert-line-server";
import { buildPublicNcertPage, loadPublicNcertDoc } from "@/lib/ncert-public-server";
import type { NcertPublicPage } from "@/lib/ncert-public";

export const getPublicNcertQuestion = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<NcertPublicPage | null> => {
    const db = await getDb();
    await ensureNcertIndexes(db);
    const doc = await loadPublicNcertDoc(db, String(data.id));
    return doc ? buildPublicNcertPage(db, doc) : null;
  });
