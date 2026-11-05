// Types shared by the NCERT Line-by-Line server functions and UI (admin +
// student). Pure — no server imports. Mirrors the shape of lib/pyq-types.ts
// on purpose, but this is a SEPARATE question bank: NCERT-syllabus questions
// tagged chapter-by-chapter, topic-by-topic, independent of any test bundle.
import type { OptionKey, Difficulty } from "@/lib/pyq-types";

/** Discriminator stored on every `questions` document that belongs to this bank. */
export const NCERT_SOURCE = "ncertLineByLine" as const;

export type NcertSubject = "Physics" | "Chemistry" | "Botany" | "Zoology";
export const NCERT_SUBJECTS: NcertSubject[] = ["Physics", "Chemistry", "Botany", "Zoology"];
export type NcertClassLevel = "11" | "12";

/** Who can open the NCERT Line-by-Line section right now. */
export type NcertVisibilityMode = "beta" | "live";
export type NcertVisibility = {
  mode: NcertVisibilityMode;
  /** Emails allowed in while mode === "beta" (lower-cased, trimmed). Ignored once mode is "live". */
  betaEmails: string[];
  updatedAt: string | null;
};

type Progress = { count: number; attempted: number; correct: number };
export type NcertTopicNode = Progress & { topic: string };
export type NcertChapterNode = Progress & { chapter: string; classLevel: NcertClassLevel; topics: NcertTopicNode[] };
export type NcertSubjectNode = Progress & { subject: string; chapters: NcertChapterNode[] };
export type NcertTree = { subjects: NcertSubjectNode[]; totalQuestions: number; totalCorrect: number };

export type NcertStatus = "new" | "correct" | "wrong" | "revealed";

export type NcertQuestion = {
  id: string;
  subject: string;
  classLevel: NcertClassLevel;
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  body: string;
  options?: Record<OptionKey, string>;
  difficulty: Difficulty;
  status: NcertStatus;
};

export type NcertList = { questions: NcertQuestion[]; total: number };

export type NcertAnswer = { option?: OptionKey; value?: number } | null;

export type NcertCheckResult = {
  isCorrect: boolean;
  revealed: boolean;
  correctOption?: OptionKey;
  correctAnswer?: number;
  solution: string;
  status: NcertStatus;
};

/** Per-topic question counts, as shown on the admin upload screen. */
export type NcertTopicCount = { subject: string; classLevel: NcertClassLevel; chapter: string; topic: string; count: number };
