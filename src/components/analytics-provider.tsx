import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { identifyUser, initAnalytics, trackPageview } from "@/lib/analytics";

// Mounted once in the root layout. Renders nothing.
export function AnalyticsProvider() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // Wait until the page is idle so analytics never competes with the first paint.
    const start = () => {
      initAnalytics();
      trackPageview(window.location.pathname);
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(start);
    else setTimeout(start, 1);
    return router.subscribe("onResolved", (e) => trackPageview(e.toLocation.pathname));
  }, [router]);

  useEffect(() => {
    if (!loading) identifyUser(user?.uid ?? null);
  }, [user?.uid, loading]);

  return null;
}
