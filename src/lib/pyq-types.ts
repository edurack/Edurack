// Types shared by the PYQ practice server functions and UI. Pure — no server imports.
import type { PyqSource } from "@/lib/pyq-label";
import type { ExamKey } from "@/lib/admin-types";

export type OptionKey = "A" | "B" | "C" | "D";
export type PyqStatus = "new" | "correct" | "wrong" | "revealed";
export type Difficulty = "Easy" | "Medium" | "Hard";

/** PYQs that have no chapter tag yet still show up, grouped under this chapter. */
export const UNTAGGED_CHAPTER = "Not yet tagged";
/** PYQs with a chapter but no topic tag are grouped under this topic. */
export const GENERAL_TOPIC = "General";

type Progress = { count: number; attempted: number; correct: number };
export type PyqTopicNode = Progress & { topic: string };
export type PyqChapterNode = Progress & { chapter: string; topics: PyqTopicNode[] };
export type PyqSubjectNode = Progress & { subject: string; chapters: PyqChapterNode[] };
export type PyqTree = { exam: ExamKey | null; subjects: PyqSubjectNode[]; totalQuestions: number; totalCorrect: number };

/** A question as sent to the student: NO correct answer, NO solution. */
export type PyqQuestion = {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  body: string;
  options?: Record<OptionKey, string>;
  difficulty: Difficulty;
  source: PyqSource;
  status: PyqStatus;
};

export type PyqList = {
  questions: PyqQuestion[];
  /** Years present for this chapter/topic (before the year filter), newest first. */
  years: string[];
  /** Matches before the 300-question cap. */
  total: number;
};

export type PyqAnswer = { option?: OptionKey; value?: number } | null;

export type PyqCheckResult = {
  isCorrect: boolean;
  revealed: boolean;
  correctOption?: OptionKey;
  correctAnswer?: number;
  solution: string;
  status: PyqStatus;
};
