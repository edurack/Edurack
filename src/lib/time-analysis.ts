// Per-question timing analysis for drills and tests (pure: no I/O, safe on server and client).
//
// Edurack records how long a student spends on each question. This turns those times, plus whether each answer was
// right, wrong or skipped, into the things a student can act on: answers given too fast to have been read, time poured
// into questions that still came out wrong, and how their wrong answers compare with their right ones.
// "Slow" and "fast" are relative to the student's OWN median time, so it works for a 20-question drill and a 180-question test.

export type TimedItem = {
  id: string;
  subject?: string;
  outcome: "correct" | "wrong" | "skipped";
  /** Seconds spent on the question; null when it was not recorded. */
  timeSec: number | null;
  /** Marks lost for a wrong answer (1 for an MCQ with negative marking, 0 for an integer question). */
  penalty: number;
};

/** A wrong answer given in under this many seconds was almost certainly not read properly. */
export const QUICK_SEC = 20;
/** A question that took more than this many times the student's median is a "time sink". */
export const SLOW_FACTOR = 2;
/** Below this many timed questions there is not enough to say anything useful. */
export const MIN_TIMED = 5;

export type TimeAnalysis = {
  timedCount: number;
  totalSec: number;
  medianSec: number;
  avgCorrectSec: number | null;
  avgWrongSec: number | null;
  /** Wrong answers given in under QUICK_SEC seconds, and the marks they cost. */
  quickWrong: { count: number; marksLost: number };
  /** Wrong answers that took more than SLOW_FACTOR x the median: time spent for no marks. */
  slowWrong: { count: number; sec: number };
  /** Questions left blank after more than SLOW_FACTOR x the median: time spent and then given up. */
  slowSkipped: { count: number; sec: number };
  /** Correct answers that took more than SLOW_FACTOR x the median. */
  slowCorrect: { count: number; sec: number };
  subjects: { subject: string; count: number; avgSec: number; accuracyPct: number }[];
  takeaways: string[];
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

export function analyzeTimes(items: TimedItem[]): TimeAnalysis | null {
  const timed = items.filter((i) => typeof i.timeSec === "number" && i.timeSec > 0) as (TimedItem & { timeSec: number })[];
  if (timed.length < MIN_TIMED) return null;

  const med = median(timed.map((i) => i.timeSec));
  const slowAt = med * SLOW_FACTOR;
  const correct = timed.filter((i) => i.outcome === "correct");
  const wrong = timed.filter((i) => i.outcome === "wrong");
  const skipped = timed.filter((i) => i.outcome === "skipped");

  const quick = wrong.filter((i) => i.timeSec < QUICK_SEC);
  const slowW = wrong.filter((i) => i.timeSec > slowAt);
  const slowS = skipped.filter((i) => i.timeSec > slowAt);
  const slowC = correct.filter((i) => i.timeSec > slowAt);
  const sum = (xs: { timeSec: number }[]) => xs.reduce((a, b) => a + b.timeSec, 0);

  const bySubject = new Map<string, (TimedItem & { timeSec: number })[]>();
  for (const i of timed) {
    const key = i.subject ?? "";
    if (key) bySubject.set(key, [...(bySubject.get(key) ?? []), i]);
  }
  const subjects = [...bySubject.entries()].map(([subject, xs]) => {
    const answered = xs.filter((i) => i.outcome !== "skipped");
    return {
      subject,
      count: xs.length,
      avgSec: Math.round(avg(xs.map((i) => i.timeSec)) ?? 0),
      accuracyPct: answered.length ? Math.round((answered.filter((i) => i.outcome === "correct").length / answered.length) * 100) : 0,
    };
  });

  const out: TimeAnalysis = {
    timedCount: timed.length,
    totalSec: Math.round(sum(timed)),
    medianSec: Math.round(med),
    avgCorrectSec: avg(correct.map((i) => i.timeSec)) === null ? null : Math.round(avg(correct.map((i) => i.timeSec))!),
    avgWrongSec: avg(wrong.map((i) => i.timeSec)) === null ? null : Math.round(avg(wrong.map((i) => i.timeSec))!),
    quickWrong: { count: quick.length, marksLost: quick.reduce((a, b) => a + b.penalty, 0) },
    slowWrong: { count: slowW.length, sec: Math.round(sum(slowW)) },
    slowSkipped: { count: slowS.length, sec: Math.round(sum(slowS)) },
    slowCorrect: { count: slowC.length, sec: Math.round(sum(slowC)) },
    subjects,
    takeaways: [],
  };

  const t: string[] = [];
  if (out.quickWrong.count >= 2) {
    t.push(
      out.quickWrong.marksLost > 0
        ? `${out.quickWrong.count} of your wrong answers came in under ${QUICK_SEC} seconds, too fast to have read the question. They cost ${out.quickWrong.marksLost} marks. Leaving them blank would have kept those marks.`
        : `${out.quickWrong.count} of your wrong answers came in under ${QUICK_SEC} seconds, too fast to have read the question. Slow down and read every option.`,
    );
  }
  if (out.slowWrong.count >= 1) {
    t.push(
      `You spent ${formatDuration(out.slowWrong.sec)} on ${out.slowWrong.count} question${out.slowWrong.count === 1 ? "" : "s"} you still got wrong, after taking more than twice your usual time on ${out.slowWrong.count === 1 ? "it" : "each"}. In the exam, mark such questions for review and move on.`,
    );
  }
  if (out.slowSkipped.count >= 1) {
    t.push(`${formatDuration(out.slowSkipped.sec)} went on ${out.slowSkipped.count} question${out.slowSkipped.count === 1 ? "" : "s"} you then left blank. Decide faster whether a question is worth attempting.`);
  }
  if (t.length < 3 && out.avgCorrectSec !== null && out.avgWrongSec !== null) {
    if (out.avgWrongSec > out.avgCorrectSec * 1.3) t.push("Your wrong answers took longer than your right ones. A long struggle is rarely rewarded: set a time limit per question.");
    else if (out.avgWrongSec < out.avgCorrectSec * 0.7) t.push("Your wrong answers were quicker than your right ones. Take a little more time to read the options before you commit.");
  }
  out.takeaways = t.length ? t.slice(0, 3) : ["Your timing looks balanced: no rushed guesses and no long struggles stood out in this attempt."];
  return out;
}

/** The headline a free student sees before the full analysis: enough to show there is something to learn, not the detail. */
export type TimeTeaser = { timedCount: number; totalSec: number; flagged: number };
export function teaserFrom(a: TimeAnalysis): TimeTeaser {
  return { timedCount: a.timedCount, totalSec: a.totalSec, flagged: a.quickWrong.count + a.slowWrong.count + a.slowSkipped.count };
}

/** Whatever times the client sent, reduced to a clean map: only the given ids, whole seconds, 0 to an hour each. */
export function cleanTimes(raw: unknown, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const id of ids) {
    const v = Number(r[id]);
    if (Number.isFinite(v) && v > 0) out[id] = Math.min(3600, Math.round(v));
  }
  return out;
}
