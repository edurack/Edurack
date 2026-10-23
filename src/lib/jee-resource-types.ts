// src/lib/jee-resource-types.ts
//
// Shared (client + server) types, constants and pure helpers for the JEE Main 2027 Notes & Practice Sheets
// library. Pure — no server or browser imports — so it can be used by admin UI, public pages, server code
// and unit tests alike.
//
// How the pieces fit together:
//   • Records live in the Mongo collection "jeeResources" (see jee-resource-core.ts).
//   • PDFs live in the PRIVATE Supabase bucket JEE_RESOURCES_BUCKET. Students never get a permanent link:
//     the server hands out a short-lived signed URL, and counts the preview/download when it does.
//   • Subjects and chapters are NOT stored as new records. They are the existing static JEE chapter set
//     (jee-blueprint-data.ts), referenced by subjectKey + chapterSlug, so a chapter can never be duplicated.

/** Exams the library can hold. Add an entry here (and its public route) to support another exam later. */
export const JEE_RESOURCE_EXAMS = [{ key: "jee-main", label: "JEE Main" }] as const;
export type JeeResourceExam = (typeof JEE_RESOURCE_EXAMS)[number]["key"];
export const DEFAULT_JEE_EXAM: JeeResourceExam = "jee-main";

/** The student-facing library is "JEE Main 2027". Resources carry an exam year; this library shows this one. */
export const JEE_LIBRARY_YEAR = 2027;

export const JEE_RESOURCE_SUBJECTS = ["physics", "chemistry", "maths"] as const;
export type JeeResourceSubject = (typeof JEE_RESOURCE_SUBJECTS)[number];
export const JEE_RESOURCE_SUBJECT_LABELS: Record<JeeResourceSubject, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  maths: "Mathematics",
};

/** Order here is the order students see the groups on a chapter page. */
export const JEE_RESOURCE_TYPES = ["full-notes", "quick-revision", "practice-sheet", "answer-key", "solutions", "other"] as const;
export type JeeResourceType = (typeof JEE_RESOURCE_TYPES)[number];
export const JEE_RESOURCE_TYPE_LABELS: Record<JeeResourceType, string> = {
  "full-notes": "Full Chapter Notes",
  "quick-revision": "Quick Revision Notes",
  "practice-sheet": "Practice Sheet",
  "answer-key": "Answer Key",
  solutions: "Detailed Solutions",
  other: "Other Resource",
};
/** Group headings on the public chapter page. */
export const JEE_RESOURCE_TYPE_GROUP_LABELS: Record<JeeResourceType, string> = {
  "full-notes": "Full Chapter Notes",
  "quick-revision": "Quick Revision Notes",
  "practice-sheet": "Practice Sheets",
  "answer-key": "Answer Keys",
  solutions: "Detailed Solutions",
  other: "Other Resources",
};

export const JEE_RESOURCES_BUCKET = "jee-resources";
export const MAX_JEE_RESOURCE_BYTES = 50 * 1024 * 1024; // Supabase Free caps uploads at 50 MB project-wide.
export const JEE_PDF_MIME = "application/pdf";

// ── URLs ────────────────────────────────────────────────────────────────────
export const JEE_LIB_BASE = "/jee-main-2027/resources";
export const jeeLibSubjectPath = (subject: string) => `${JEE_LIB_BASE}/${subject}`;
export const jeeLibChapterPath = (subject: string, chapter: string) => `${JEE_LIB_BASE}/${subject}/${chapter}`;

// ── Shapes ──────────────────────────────────────────────────────────────────
/** What students see. Never carries a storage path, bucket or link. */
export type PublicJeeResource = {
  id: string;
  title: string;
  description: string;
  exam: JeeResourceExam;
  examYear: number;
  subjectKey: JeeResourceSubject;
  chapterSlug: string;
  type: JeeResourceType;
  fileName: string;
  sizeBytes: number;
  version: string;
  lastReviewedAt: string | null; // YYYY-MM-DD
  publishedAt: string | null;
  updatedAt: string;
};

/** What the admin table and editor use. */
export type AdminJeeResource = PublicJeeResource & {
  published: boolean;
  displayOrder: number;
  sourceConfirmed: boolean;
  mimeType: string;
  downloadCount: number;
  previewCount: number;
  createdAt: string;
};

/** What the admin form submits. `filePath` is the object path returned by adminJeeCreateUpload. */
export type JeeResourceInput = {
  exam: string;
  examYear: number;
  subjectKey: string;
  chapterSlug: string;
  type: string;
  title: string;
  description: string;
  published: boolean;
  version: string;
  lastReviewedAt: string;
  displayOrder: number;
  sourceConfirmed: boolean;
  /** Required when creating; optional when editing (present = replace the PDF). */
  filePath?: string;
  fileName?: string;
};

export type JeeAdminFilters = {
  q?: string;
  subjectKey?: string;
  chapterSlug?: string;
  type?: string;
  status?: "all" | "published" | "draft";
  page?: number;
};

export type JeeAdminTotals = { resources: number; published: number; drafts: number; downloads: number; previews: number };

export type JeeAdminList = {
  items: AdminJeeResource[];
  total: number;
  page: number;
  pageSize: number;
  totals: JeeAdminTotals;
  top: { id: string; title: string; subjectKey: string; chapterSlug: string; downloads: number; previews: number }[];
};

/** Published-resource counts, used for entry points and "which chapters have something". */
export type JeeLibrarySummary = {
  total: number;
  bySubject: Record<string, number>;
  /** key = `${subjectKey}/${chapterSlug}` */
  byChapter: Record<string, number>;
  /** newest updatedAt among published resources (ISO), for sitemap lastmod */
  lastUpdated: string | null;
};

export const ADMIN_PAGE_SIZE = 15;

// ── Pure validation helpers (shared by the browser and the server) ──────────
export const isJeeSubject = (v: unknown): v is JeeResourceSubject => JEE_RESOURCE_SUBJECTS.includes(v as JeeResourceSubject);
export const isJeeType = (v: unknown): v is JeeResourceType => JEE_RESOURCE_TYPES.includes(v as JeeResourceType);
export const isJeeExam = (v: unknown): v is JeeResourceExam => JEE_RESOURCE_EXAMS.some((e) => e.key === v);

export const extOf = (name: string) => (name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "");

export const formatBytes = (bytes: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Returns a readable error, or null if the file's name, size and type are acceptable. (Magic bytes are checked separately.) */
export function validatePdfMeta(file: { name: string; size: number; type?: string }): string | null {
  if (extOf(file.name) !== "pdf") return "Only PDF files can be uploaded. Please choose a .pdf file.";
  if (file.type && file.type !== JEE_PDF_MIME && file.type !== "application/x-pdf") return "That file doesn't look like a PDF. Please export it as a PDF and try again.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_JEE_RESOURCE_BYTES) return `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_JEE_RESOURCE_BYTES)}. Compress the PDF and try again.`;
  return null;
}

/** True when the first bytes are a PDF header ("%PDF-"). */
export function hasPdfMagic(bytes: ArrayLike<number>): boolean {
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
}

/** A safe object-name stem: letters, digits, dash, underscore. */
export function safeFileStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return stem || "resource";
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
