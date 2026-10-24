// JEE Main 2027 landing page (/jee-main-2027) — PUBLIC server function. No login needed.
//
// One read for the whole page, assembled ONLY from existing public reads, each of which already filters to
// published content:
//   • summary   → librarySummary()        (published JEE Main 2027 resources: counts per subject and chapter)
//   • featured  → featuredChapters()      (chapters with published resources, and which types exist; metadata only)
//   • blog      → loadJeeBlogSections()   (published JEE posts; never drafts, scheduled, archived or deleted)
//   • pyqTotal  → the PYQ page's own question tree for JEE
// Nothing here carries a storage path, bucket or file link. Each part fails on its own: if one source is down the
// page still renders with that block empty (and hidden), exactly like getJeeLibrarySummary.
import { createServerFn } from "@tanstack/react-start";
import { loadJeeBlogSections } from "@/server-functions/blog-public";
import { featuredChapters, librarySummary } from "@/lib/jee-resource-core";
import { jeePyqTotal } from "@/lib/jee-landing-core";
import { EMPTY_JEE_LANDING_BLOG, type JeeLandingData } from "@/lib/jee-landing-types";
import type { JeeLibrarySummary } from "@/lib/jee-resource-types";

const EMPTY_SUMMARY: JeeLibrarySummary = { total: 0, bySubject: {}, byChapter: {}, lastUpdated: null };

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[jee-landing] ${label} failed:`, e);
    return fallback;
  }
}

export const getJeeLandingData = createServerFn({ method: "GET" }).handler(async (): Promise<JeeLandingData> => {
  const [summary, featured, blog, pyqTotal] = await Promise.all([
    safe("summary", () => librarySummary(), EMPTY_SUMMARY),
    safe("featured", () => featuredChapters(6), []),
    loadJeeBlogSections({ updatesLimit: 3, guidesLimit: 3 }), // handles its own failures
    safe("pyq count", () => jeePyqTotal(), 0),
  ]);
  return { summary, featured, blog: blog ?? EMPTY_JEE_LANDING_BLOG, pyqTotal };
});
