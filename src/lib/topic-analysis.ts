// Pure topic/chapter analysis for one finished attempt. No server imports —
// server-functions/test-results.ts feeds it the attempt's graded results and
// the matching `questions` documents (which carry chapter / topic / difficulty).
import { MARKS_PER_QUESTION, wasAnswered, type AttemptResultLike } from "@/lib/attempt-rules";

export type Priority = "high" | "medium" | "strong";

export type TopicStat = {
  topic: string;
  total: number;
  correct: number;
  incorrect: number;
  skipped: number;
  marks: number;
  maxMarks: number;
  /** marks / maxMarks, 0-100, never negative (negative marking can push raw below 0). */
  scorePercent: number;
  /** maxMarks − marks, so negative marking counts as lost too. */
  lostMarks: number;
};

export type ChapterStat = Omit<TopicStat, "topic"> & {
  chapter: string;
  priority: Priority;
  topics: TopicStat[];
};

export type SubjectTopicStat = {
  subject: string;
  chapters: ChapterStat[];
  /** Counted questions in this subject with no chapter tag. */
  untaggedCount: number;
};

export type FocusItem = {
  subject: string;
  chapter: string;
  total: number;
  lostMarks: number;
  scorePercent: number;
  weakTopics: string[];
};

export type TopicAnalysis = {
  totalCounted: number;
  taggedCount: number;
  untaggedCount: number;
  subjects: SubjectTopicStat[];
  focus: FocusItem[];
  strong: { subject: string; chapter: string; total: number; scorePercent: number }[];
  /** Easy questions the student didn't get right — usually carelessness, worth flagging. */
  easyMissed: { missed: number; totalEasy: number };
};

export type AnalysisResult = AttemptResultLike & { isCorrect: boolean; marksAwarded: number };
export type AnalysisQuestionMeta = { chapter?: string; topic?: string; difficulty?: string };

type Acc = { total: number; correct: number; incorrect: number; skipped: number; marks: number };
const blank = (): Acc => ({ total: 0, correct: 0, incorrect: 0, skipped: 0, marks: 0 });

function finish<T extends Acc>(a: T) {
  const maxMarks = a.total * MARKS_PER_QUESTION;
  return {
    ...a,
    maxMarks,
    scorePercent: maxMarks > 0 ? Math.max(0, Math.round((a.marks / maxMarks) * 100)) : 0,
    lostMarks: maxMarks - a.marks,
  };
}

export function priorityFor(scorePercent: number): Priority {
  if (scorePercent < 40) return "high";
  if (scorePercent < 70) return "medium";
  return "strong";
}

export function buildTopicAnalysis(
  results: AnalysisResult[],
  meta: Map<string, AnalysisQuestionMeta>,
  excluded: Set<string>,
): TopicAnalysis {
  const bySubject = new Map<string, { chapters: Map<string, { acc: Acc; topics: Map<string, Acc> }>; untagged: number }>();
  let totalCounted = 0;
  let untaggedCount = 0;
  let totalEasy = 0;
  let easyMissed = 0;

  for (const r of results) {
    if (excluded.has(r.questionId)) continue;
    totalCounted++;

    const m = meta.get(r.questionId);
    const answered = wasAnswered(r);

    if (m?.difficulty === "Easy") {
      totalEasy++;
      if (!r.isCorrect) easyMissed++;
    }

    const subj = bySubject.get(r.subject) ?? { chapters: new Map(), untagged: 0 };
    bySubject.set(r.subject, subj);

    const chapterName = m?.chapter?.trim();
    if (!chapterName) {
      subj.untagged++;
      untaggedCount++;
      continue;
    }
    const topicName = m?.topic?.trim() || "General";

    const ch = subj.chapters.get(chapterName) ?? { acc: blank(), topics: new Map() };
    subj.chapters.set(chapterName, ch);
    const tp = ch.topics.get(topicName) ?? blank();
    ch.topics.set(topicName, tp);

    for (const a of [ch.acc, tp]) {
      a.total++;
      a.marks += r.marksAwarded;
      if (r.isCorrect) a.correct++;
      else if (answered) a.incorrect++;
      else a.skipped++;
    }
  }

  const subjects: SubjectTopicStat[] = Array.from(bySubject.entries()).map(([subject, s]) => {
    const chapters: ChapterStat[] = Array.from(s.chapters.entries())
      .map(([chapter, c]) => {
        const stats = finish(c.acc);
        const topics: TopicStat[] = Array.from(c.topics.entries())
          .map(([topic, t]) => ({ topic, ...finish(t) }))
          .sort((a, b) => b.lostMarks - a.lostMarks || a.scorePercent - b.scorePercent);
        return { chapter, ...stats, priority: priorityFor(stats.scorePercent), topics };
      })
      .sort((a, b) => b.lostMarks - a.lostMarks || a.scorePercent - b.scorePercent);
    return { subject, chapters, untaggedCount: s.untagged };
  });

  const focus: FocusItem[] = subjects
    .flatMap((s) => s.chapters.map((c) => ({ s, c })))
    .filter(({ c }) => c.priority !== "strong" && c.lostMarks > 0)
    .sort((a, b) => b.c.lostMarks - a.c.lostMarks || a.c.scorePercent - b.c.scorePercent)
    .slice(0, 5)
    .map(({ s, c }) => ({
      subject: s.subject,
      chapter: c.chapter,
      total: c.total,
      lostMarks: c.lostMarks,
      scorePercent: c.scorePercent,
      weakTopics: c.topics
        .filter((t) => t.lostMarks > 0 && t.topic !== "General")
        .slice(0, 3)
        .map((t) => t.topic),
    }));

  const strong = subjects
    .flatMap((s) => s.chapters.map((c) => ({ subject: s.subject, ...c })))
    .filter((c) => c.priority === "strong" && c.total >= 2)
    .sort((a, b) => b.scorePercent - a.scorePercent || b.total - a.total)
    .slice(0, 4)
    .map((c) => ({ subject: c.subject, chapter: c.chapter, total: c.total, scorePercent: c.scorePercent }));

  return {
    totalCounted,
    taggedCount: totalCounted - untaggedCount,
    untaggedCount,
    subjects,
    focus,
    strong,
    easyMissed: { missed: easyMissed, totalEasy },
  };
}
