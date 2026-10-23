// JEE Main 2027 resource library — PUBLIC server functions. No login needed.
//
//  • getJeeLibrarySummary / listJeeChapterResources: published files only, metadata only — never a link or path.
//  • accessJeeResource: signs a short-lived link for preview or download and counts it (once per visitor per hour).
//    A logged-in student is recognised if a valid token is sent; a missing/invalid token just means "guest".
import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { accessResource, chapterResources, librarySummary } from "@/lib/jee-resource-core";
import type { JeeLibrarySummary, PublicJeeResource } from "@/lib/jee-resource-types";

const EMPTY: JeeLibrarySummary = { total: 0, bySubject: {}, byChapter: {}, lastUpdated: null };

export const getJeeLibrarySummary = createServerFn({ method: "GET" }).handler(async (): Promise<JeeLibrarySummary> => {
  // Entry points on other pages must never break them: if the database hiccups, behave as "nothing published".
  try {
    return await librarySummary();
  } catch (e) {
    console.error("[jee-resources] summary failed:", e);
    return EMPTY;
  }
});

export const listJeeChapterResources = createServerFn({ method: "GET" })
  .validator((data: { subject: string; chapter: string }) => data)
  .handler(async ({ data }): Promise<PublicJeeResource[]> => chapterResources(String(data.subject), String(data.chapter)));

export const accessJeeResource = createServerFn({ method: "POST" })
  .validator((data: { resourceId: string; mode: "preview" | "download"; visitorId: string; token?: string | null }) => data)
  .handler(async ({ data }) => {
    let uid: string | null = null;
    if (data.token) {
      try {
        uid = (await adminAuth.verifyIdToken(data.token)).uid;
      } catch {
        uid = null;
      }
    }
    return accessResource({ resourceId: data.resourceId, mode: data.mode === "preview" ? "preview" : "download", visitorId: data.visitorId, uid });
  });
