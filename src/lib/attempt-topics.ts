// Server-side loading shared by everything that needs "which chapters cost this
// student marks in this attempt": the Topic-wise analysis card on the result
// page and the "Practice my weak topics" PYQ session. One implementation so the
// two can never disagree about what counts as weak.
import type { getDb } from "@/lib/mongo";
import { getExcludedQuestions, type AttemptRule } from "@/lib/attempt-rules";
import { buildTopicAnalysis, type AnalysisResult, type TopicAnalysis } from "@/lib/topic-analysis";

type Db = Awaited<ReturnType<typeof getDb>>;

/** "Attempt any N of M" rules live on the test (testCores.attemptRules). */
export async function loadAttemptRules(db: Db, testId: string): Promise<AttemptRule[]> {
  try {
    const { ObjectId } = await import("mongodb");
    const doc = await db.collection("testCores").findOne({ _id: new ObjectId(testId) }, { projection: { attemptRules: 1 } });
    return (doc?.attemptRules as AttemptRule[] | undefined) ?? [];
  } catch {
    return [];
  }
}

/** Joins an attempt's graded results with the questions' chapter/topic/difficulty tags. */
export async function loadAttemptTopicAnalysis(
  db: Db,
  attempt: { testId?: unknown; totalMarks?: unknown; questionResults?: unknown },
): Promise<TopicAnalysis> {
  const { ObjectId } = await import("mongodb");
  const results = (attempt.questionResults ?? []) as AnalysisResult[];

  const rules = await loadAttemptRules(db, String(attempt.testId ?? ""));
  const { excluded } = getExcludedQuestions(results, rules, Number(attempt.totalMarks));

  const docs = await db
    .collection("questions")
    .find(
      { _id: { $in: results.map((r) => new ObjectId(r.questionId)) } },
      { projection: { chapter: 1, topic: 1, difficulty: 1 } },
    )
    .toArray();
  const meta = new Map(
    docs.map((d) => [
      String(d._id),
      {
        chapter: d.chapter as string | undefined,
        topic: d.topic as string | undefined,
        difficulty: d.difficulty as string | undefined,
      },
    ]),
  );

  return buildTopicAnalysis(results, meta, excluded);
}
