// Server function backing the landing-page CBT demo widget
// (components/landing/CbtSimulator.tsx). Deliberately public — no token,
// no requireSignedIn — since this runs for anonymous visitors before
// they've signed up. This is purely a "did the demo work / are people
// finishing it" signal, not a real test attempt, so it's stored in its
// own collection rather than testAttempts.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";

type DemoAnswer = {
  subject: string;
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
};

export const submitDemoTestAttempt = createServerFn({ method: "POST" })
  .validator(
    (data: {
      track: "PCM" | "PCB";
      answers: DemoAnswer[];
      score: number;
      totalMarks: number;
      correctCount: number;
      wrongCount: number;
      skippedCount: number;
      timeTakenSeconds: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.collection("landingDemoAttempts").insertOne({
      track: data.track,
      answers: data.answers,
      score: data.score,
      totalMarks: data.totalMarks,
      correctCount: data.correctCount,
      wrongCount: data.wrongCount,
      skippedCount: data.skippedCount,
      totalQuestions: data.answers.length,
      timeTakenSeconds: data.timeTakenSeconds,
      createdAt: new Date(),
    });
    return { ok: true };
  });

  type LiveSubjectResult = {
  subject: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  marks: number;
};

export const submitSimulatorLiveAttempt = createServerFn({ method: "POST" })
  .validator(
    (data: {
      track: "PCB" | "PCM";
      score: number;
      totalMarks: number;
      correctCount: number;
      incorrectCount: number;
      unansweredCount: number;
      timeTakenMinutes: number;
      subjectBreakdown: LiveSubjectResult[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.collection("simulatorLiveAttempts").insertOne({
      ...data,
      createdAt: new Date(),
    });
    return { ok: true };
  });