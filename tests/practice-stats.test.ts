// Run with: node --experimental-strip-types --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import {
  accuracyPercent, buildExamStats, clampPercent, defaultExamTab, pickFirstChapter, summariseTests, testScorePercent,
  EMPTY_PRACTICE_STATS, type PracticeStats,
} from "../src/lib/practice-stats.ts";
import { answeredProps, completedProps, isMistakeRevision, practiceModeFor, practiceProps } from "../src/lib/practice-events.ts";

test("accuracy: null (not 0%) when nothing solved, never above 100", () => {
  assert.equal(accuracyPercent(0, 0), null);
  assert.equal(accuracyPercent(3, 4), 75);
  assert.equal(accuracyPercent(9, 4), 100);
  assert.equal(accuracyPercent(-2, 4), 0);
  assert.equal(accuracyPercent(1, Number.NaN), null);
});

test("buildExamStats clamps and derives accuracy", () => {
  const s = buildExamStats({ solved: 10, correct: 12, weekAnswered: 4, distinctDays: 2, due: 3 });
  assert.equal(s.correct, 10);
  assert.equal(s.accuracy, 100);
  assert.deepEqual(buildExamStats({ solved: 0, correct: 0, weekAnswered: 0, distinctDays: 0, due: 0 }).accuracy, null);
});

test("negative-marking test scores are floored at 0 and capped at 100", () => {
  assert.equal(testScorePercent(-12, 720), 0);
  assert.equal(testScorePercent(360, 720), 50);
  assert.equal(testScorePercent(800, 720), 100);
  assert.equal(testScorePercent(10, 0), 0);
});

test("summariseTests: weighted by attempts, exact when percentSum is present, filterable by exam", () => {
  const rows = [
    { bundleId: "a", bundleTitle: "A", exam: "neet", testsAttempted: 1, totalAttempts: 1, averagePercent: 50, bestPercent: 50, percentSum: 50 },
    { bundleId: "b", bundleTitle: "B", exam: "neet", testsAttempted: 2, totalAttempts: 2, averagePercent: 33, bestPercent: 40, percentSum: 66.5 },
    { bundleId: "c", bundleTitle: "C", exam: "jee", testsAttempted: 1, totalAttempts: 1, averagePercent: 80, bestPercent: 80, percentSum: 80 },
    { bundleId: "d", bundleTitle: "D", exam: "neet", testsAttempted: 0, totalAttempts: 0, averagePercent: 0, bestPercent: 0 },
  ];
  assert.deepEqual(summariseTests(rows, "neet"), { average: 39, best: 50, tests: 3, attempts: 3 });
  assert.deepEqual(summariseTests(rows, "jee"), { average: 80, best: 80, tests: 1, attempts: 1 });
  assert.equal(summariseTests([], "neet"), null);
  assert.equal(summariseTests(null), null);
  // legacy rows without exam count as NEET
  assert.equal(summariseTests([{ bundleId: "x", bundleTitle: "X", testsAttempted: 1, totalAttempts: 1, averagePercent: 10, bestPercent: 10 }], "neet")?.average, 10);
});

test("defaultExamTab: most practised exam wins, tie falls back to target exam then NEET", () => {
  const mk = (neet: number, jee: number): PracticeStats => ({
    ...EMPTY_PRACTICE_STATS,
    byExam: { neet: buildExamStats({ solved: neet, correct: 0, weekAnswered: 0, distinctDays: 0, due: 0 }), jee: buildExamStats({ solved: jee, correct: 0, weekAnswered: 0, distinctDays: 0, due: 0 }) },
  });
  assert.equal(defaultExamTab(mk(5, 9), "neet"), "jee");
  assert.equal(defaultExamTab(mk(9, 5), "jee"), "neet");
  assert.equal(defaultExamTab(mk(0, 0), "JEE Mains"), "jee");
  assert.equal(defaultExamTab(mk(0, 0), ""), "neet");
});

test("pickFirstChapter: biggest tagged chapter of the first usable subject; skips untagged", () => {
  const tree = {
    subjects: [
      { subject: "Physics", count: 0, chapters: [] },
      { subject: "Chemistry", count: 30, chapters: [{ chapter: "Not yet tagged", count: 20 }, { chapter: "Mole concept", count: 6 }, { chapter: "Atomic structure", count: 9 }] },
      { subject: "Botany", count: 50, chapters: [{ chapter: "Cell", count: 50 }] },
    ],
  };
  assert.deepEqual(pickFirstChapter(tree), { subject: "Chemistry", chapter: "Atomic structure" });
  assert.equal(pickFirstChapter({ subjects: [] }), null);
  assert.equal(pickFirstChapter(null), null);
  assert.equal(pickFirstChapter({ subjects: [{ subject: "X", count: 3, chapters: [{ chapter: "Not yet tagged", count: 3 }] }] }), null);
});

test("clampPercent handles junk", () => {
  assert.equal(clampPercent(Number.NaN), 0);
  assert.equal(clampPercent(120.4), 100);
  assert.equal(clampPercent(-3), 0);
});

test("practice mode mapping and the mistake-revision pair", () => {
  assert.equal(practiceModeFor({ session: "daily" }), "daily");
  assert.equal(practiceModeFor({ session: "due" }), "revision");
  assert.equal(practiceModeFor({ session: "wrong" }), "mistakes");
  assert.equal(practiceModeFor({ session: "bookmarked" }), "bookmarks");
  assert.equal(practiceModeFor({ weakAttemptId: "abc" }), "weak_topics");
  assert.equal(practiceModeFor({}), "chapter");
  assert.equal(isMistakeRevision("revision"), true);
  assert.equal(isMistakeRevision("mistakes"), true);
  assert.equal(isMistakeRevision("chapter"), false);
});

test("event props separate ordinary PYQ from timed drills and never carry the chosen answer or personal data", () => {
  assert.equal(practiceProps({ mode: "chapter", exam: "neet" }).practice_type, "pyq");
  assert.equal(practiceProps({ mode: "timed_drill" }).practice_type, "timed_drill");
  const a = answeredProps({ mode: "daily", exam: "neet", subject: "Physics", chapter: "Kinematics" }, { questionId: "q1", questionType: "mcq", isCorrect: true });
  assert.deepEqual(Object.keys(a).sort(), ["chapter", "exam", "guest", "is_correct", "mode", "practice_type", "question_id", "question_type", "source", "subject"]);
  for (const k of Object.keys(a)) assert.ok(!/answer|option|email|name|phone|mobile|city/.test(k) || k === "question_type", `unexpected key ${k}`);
  const c = completedProps({ mode: "chapter" }, { answered: 4, correct: 3, wrong: 1, peeked: 0 });
  assert.equal(c.accuracy, 75);
  assert.equal(completedProps({ mode: "chapter" }, { answered: 0, correct: 0, wrong: 0, peeked: 1 }).accuracy, null);
});

import { missingPrepFields, targetYearOptions } from "../src/lib/prep-profile.ts";

test("prep card only asks for what is missing", () => {
  assert.deepEqual(missingPrepFields({ targetExam: "neet", track: "12th", targetYear: 2027 }), []);
  assert.deepEqual(missingPrepFields({ targetExam: "neet", track: "12th", targetYear: null }), ["year"]);
  assert.deepEqual(missingPrepFields({ targetExam: "", track: "", targetYear: null }), ["exam", "track", "year"]);
  assert.deepEqual(missingPrepFields({ targetExam: "JEE Main", track: "Dropper", targetYear: 2026 }), []);
  assert.deepEqual(missingPrepFields(null), []);
});

test("target years start next year once this year's exam season has passed", () => {
  assert.deepEqual(targetYearOptions(new Date(2026, 9, 24)), [2027, 2028, 2029, 2030]); // 24 Oct 2026
  assert.deepEqual(targetYearOptions(new Date(2026, 2, 1)), [2026, 2027, 2028, 2029]); // 1 Mar 2026
});

import { quickMockStatus, quickMockCopy, cleanQuickMockSource, quickMockName, freeQuickMockOffered, EXHAUSTED_MESSAGE } from "../src/lib/quick-mock.ts";
import { isCorrection, isDuplicateSubmit } from "../src/lib/practice-schedule.ts";
import { practiceProgress } from "../src/lib/practice-stats.ts";

const base = { gatingOn: true, isPro: false, unlimited: false, usedToday: 0, freeLimit: 1 };

test("quick mock status follows the REAL free allowance, not a hard-coded one", () => {
  assert.equal(quickMockStatus(null).kind, "unknown");
  assert.deepEqual(quickMockStatus(base), { kind: "ready", unlimited: false, isPro: false, left: 1, freeLimit: 1 });
  assert.equal(quickMockStatus({ ...base, usedToday: 1 }).kind, "exhausted");
  assert.equal(quickMockStatus({ ...base, freeLimit: 2, usedToday: 1 }).kind, "ready");
  assert.equal(quickMockStatus({ ...base, freeLimit: 0 }).kind, "pro_only");
  assert.equal(quickMockStatus({ ...base, freeLimit: 0, gatingOn: false, unlimited: true }).kind, "ready"); // Pro not on sale: nothing is limited
  assert.equal(quickMockStatus({ ...base, usedToday: 9, unlimited: true, isPro: true }).kind, "ready");
  // an unfinished drill can always be resumed, even with no free drills left
  assert.equal(quickMockStatus({ ...base, usedToday: 1, running: { drillId: "d1", remainingSec: 600 } }).kind, "resume");
  assert.equal(quickMockStatus({ ...base, usedToday: 1, running: { drillId: "d1", remainingSec: 0 } }).kind, "exhausted");
});

test("quick mock copy uses the required wording", () => {
  assert.equal(quickMockCopy(quickMockStatus(base)).headline, "Your free Quick Mock is ready!");
  assert.equal(quickMockCopy(quickMockStatus({ ...base, usedToday: 1 })).headline, EXHAUSTED_MESSAGE);
  assert.ok(EXHAUSTED_MESSAGE.startsWith("You've completed today's free Quick Mock. Come back tomorrow for another"));
  assert.equal(quickMockCopy(quickMockStatus({ ...base, freeLimit: 3 })).detail, "3 of 3 free today");
  assert.equal(quickMockCopy(quickMockStatus({ ...base, freeLimit: 1 })).detail, null);
  assert.equal(quickMockCopy(quickMockStatus({ ...base, unlimited: true, isPro: true })).headline, "Your Quick Mock is ready!");
  assert.equal(quickMockCopy(quickMockStatus({ ...base, usedToday: 1 })).canStart, false);
});

test("sources, names and the homepage 'free' promise", () => {
  assert.equal(cleanQuickMockSource("homepage"), "homepage");
  assert.equal(cleanQuickMockSource("evil<script>"), undefined);
  assert.equal(quickMockName("neet"), "NEET Quick Mock");
  assert.equal(quickMockName("jee"), "JEE Quick Mock");
  assert.equal(quickMockName(null), "NEET Quick Mock");
  assert.equal(freeQuickMockOffered({ gatingOn: true, freeLimit: 0 }), false);
  assert.equal(freeQuickMockOffered({ gatingOn: true, freeLimit: 1 }), true);
  assert.equal(freeQuickMockOffered({ gatingOn: false, freeLimit: 0 }), true);
  assert.equal(freeQuickMockOffered(null), true);
});

test("a correction is counted only when a past mistake becomes correct", () => {
  assert.equal(isCorrection({ attempts: 1, correct: false }, "correct"), true);
  assert.equal(isCorrection({ attempts: 2, correct: true }, "correct"), false); // already right
  assert.equal(isCorrection({ attempts: 1, correct: false }, "wrong"), false);
  assert.equal(isCorrection(null, "correct"), false); // first ever answer
  assert.equal(isCorrection({ attempts: 0, correct: false }, "correct"), false); // only peeked, never answered
});

test("double taps are one submission; a real retry later is not", () => {
  const t0 = new Date("2026-10-24T10:00:00Z");
  const prev = { attempts: 1, lastAnswer: "B", updatedAt: t0 };
  assert.equal(isDuplicateSubmit(prev, "B", new Date(t0.getTime() + 1200)), true);
  assert.equal(isDuplicateSubmit(prev, "C", new Date(t0.getTime() + 1200)), false); // changed answer
  assert.equal(isDuplicateSubmit(prev, "B", new Date(t0.getTime() + 9000)), false); // a genuine retry
  assert.equal(isDuplicateSubmit(null, "B", t0), false);
  assert.equal(isDuplicateSubmit({ attempts: 0, lastAnswer: "B", updatedAt: t0 }, "B", t0), false);
  assert.equal(isDuplicateSubmit({ attempts: 1, lastAnswer: 12, updatedAt: t0 }, 12, t0), true); // numerical answers
});

test("progress metrics: unique attempts only, never above what exists", () => {
  assert.deepEqual(practiceProgress(100, 25, 20), { available: 100, attempted: 25, remaining: 75, accuracy: 80, percentDone: 25 });
  assert.deepEqual(practiceProgress(10, 14, 14), { available: 10, attempted: 10, remaining: 0, accuracy: 100, percentDone: 100 });
  assert.deepEqual(practiceProgress(0, 0, 0), { available: 0, attempted: 0, remaining: 0, accuracy: null, percentDone: 0 });
});
