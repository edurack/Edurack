// Remembers which exam a visitor picked on the landing page (hero chips and the simulator tabs
// share it), so a returning visitor lands on their exam instead of the default, and onboarding can
// start with it already selected. Server render and first client render both use "neet"; the saved
// choice is applied in an effect, so there is no hydration mismatch.
import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { DEMO_EXAM_KEYS, type DemoExam } from "./exam-demos";

export const PREFERRED_EXAM_KEY = "edurack-landing-exam";
const EVENT = "edurack:landing-exam";
const isLive = (v: unknown): v is DemoExam => typeof v === "string" && (DEMO_EXAM_KEYS as string[]).includes(v);

export function usePreferredExam(source: string): [DemoExam, (exam: DemoExam) => void] {
  const [exam, setExamState] = useState<DemoExam>("neet");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFERRED_EXAM_KEY);
      if (isLive(saved)) setExamState(saved);
    } catch { /* storage unavailable: keep the default */ }
    const onChange = (e: Event) => {
      const next = (e as CustomEvent).detail;
      if (isLive(next)) setExamState(next);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setExam = useCallback(
    (next: DemoExam) => {
      setExamState(next);
      try { localStorage.setItem(PREFERRED_EXAM_KEY, next); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: next })); // keeps the other picker on the page in sync
      track("landing_exam_selected", { exam: next, source });
    },
    [source],
  );

  return [exam, setExam];
}
