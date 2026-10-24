// What the Quick Mock button should say for THIS student right now: free one ready, used up, Pro-only, in progress.
// Reads the same getDrillAccess the Quick Mock page and the server use, so it can't promise a free mock the server will refuse.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getDrillAccess } from "@/server-functions/pro";
import { hasFeature, type DrillAccess } from "@/lib/pro";
import { quickMockStatus, type QuickMockStatus } from "@/lib/quick-mock";

export function useQuickMockStatus(): { access: DrillAccess | null; status: QuickMockStatus; loaded: boolean } {
  const { user } = useAuth();
  const [access, setAccess] = useState<DrillAccess | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const a = await getDrillAccess({ data: { token: await user.getIdToken() } });
        if (!cancelled) setAccess(a);
      } catch {
        // unknown status: the card falls back to a plain "Start Quick Mock"; the server still enforces the limits
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const status = useMemo(
    () =>
      access
        ? quickMockStatus({ gatingOn: access.gatingOn, isPro: access.isPro, unlimited: hasFeature(access, "unlimitedDrills"), usedToday: access.usedToday, freeLimit: access.freeLimit, running: access.running })
        : quickMockStatus(null),
    [access],
  );
  return { access, status, loaded };
}
