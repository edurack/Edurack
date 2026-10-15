// Shared (client + server) types for the open "Free Resources" library. Pure — no server imports.
import type { ExamKey } from "@/lib/admin-types";

/** "all" = useful for every exam (formula sheets, study-planner templates, etc.). */
export type ResourceExam = ExamKey | "all";
export const RESOURCE_EXAMS: ResourceExam[] = ["neet", "jee", "cuet", "ipmat", "all"];
export const RESOURCE_EXAM_LABELS: Record<ResourceExam, string> = {
  neet: "NEET",
  jee: "JEE",
  cuet: "CUET",
  ipmat: "IPMAT",
  all: "All exams",
};

export const RESOURCE_CATEGORIES = ["notes", "pyq", "formula-sheet", "syllabus", "planner", "other"] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  notes: "Notes",
  pyq: "Previous year papers",
  "formula-sheet": "Formula sheets",
  syllabus: "Syllabus",
  planner: "Planners",
  other: "Other",
};

export const RESOURCE_ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip", "png", "jpg", "jpeg"];
export const FREE_RESOURCES_BUCKET = "free-resources";
export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024; // Supabase Free caps uploads at 50MB

/** What the PUBLIC page sees. Never carries the storage path or any link. */
export type PublicResource = {
  id: string;
  title: string;
  description: string;
  exam: ResourceExam;
  category: ResourceCategory;
  subject: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloads: number;
  createdAt: string;
};

/** What the admin sees/edits. */
export type AdminResource = PublicResource & {
  published: boolean;
  bucket: string | null;
  path: string | null;
  uniqueDownloaders: number;
  lastDownloadedAt: string | null;
};

export type ResourceInput = {
  title: string;
  description: string;
  exam: ResourceExam;
  category: ResourceCategory;
  subject: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bucket: string;
  path: string;
  published: boolean;
};

export type ResourceStats = {
  totals: { resources: number; downloads: number; today: number; last7d: number; last30d: number; uniqueVisitors: number; loggedIn: number; guests: number };
  daily: { day: string; n: number }[]; // last 30 IST days
  byExam: { label: string; n: number }[];
  byCategory: { label: string; n: number }[];
  top: { id: string; title: string; exam: ResourceExam; n: number }[];
  recent: { id: string; title: string; exam: ResourceExam; who: "student" | "guest"; at: string }[];
};
