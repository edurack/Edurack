// One fetch of the student's practice numbers, shared by everything on the dashboard that shows them (the hero and
// the performance card), so they can never disagree. Refetches when an answer is saved from the daily-question popup.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getPracticeStats } from "@/server-functions/practice-stats";
import { PRACTICE_ANSWERED_EVENT } from "@/components/dashboard/streak-popup";
import type { PracticeStats } from "@/lib/practice-stats";

export function usePracticeStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!user) return;
      try {
        const res = await getPracticeStats({ data: { token: await user.getIdToken() } });
        if (isCancelled()) return;
        setStats(res);
        setFailed(false);
      } catch (err) {
        console.error("[dashboard] practice stats failed:", err);
        if (!isCancelled()) setFailed(true);
      }
    },
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    const onAnswered = () => void load(() => cancelled);
    window.addEventListener(PRACTICE_ANSWERED_EVENT, onAnswered);
    return () => {
      cancelled = true;
      window.removeEventListener(PRACTICE_ANSWERED_EVENT, onAnswered);
    };
  }, [load]);

  return { stats, failed, reload: () => void load() };
}
