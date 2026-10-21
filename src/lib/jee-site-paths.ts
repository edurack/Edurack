// src/lib/jee-site-paths.ts — every public JEE URL (weightage, analysis, syllabus, guides) for the sitemap.
import { allJeePaths } from "@/lib/jee-blueprint";
import { allPaperPaths } from "@/lib/jee-paper-analysis";
import { HIGH_WEIGHT_PATH, REMOVED_PATH, TRENDS_PATH } from "@/lib/jee-insights";
import { SYLLABUS_BASE, syllabusKeys, syllabusPath } from "@/lib/jee-syllabus";

export type JeePathKind = "hub" | "subject" | "chapter" | "concepts" | "paper-hub" | "paper-year" | "paper-subject" | "syllabus-hub" | "syllabus" | "guide";

export function allJeeSitePaths(): { path: string; kind: JeePathKind }[] {
  return [
    ...allJeePaths(),
    ...allPaperPaths(),
    { path: SYLLABUS_BASE, kind: "syllabus-hub" },
    ...syllabusKeys().map((k) => ({ path: syllabusPath(k), kind: "syllabus" as const })),
    { path: HIGH_WEIGHT_PATH, kind: "guide" },
    { path: TRENDS_PATH, kind: "guide" },
    { path: REMOVED_PATH, kind: "guide" },
  ];
}
