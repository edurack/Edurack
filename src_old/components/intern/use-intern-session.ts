// Shared by every intern-facing route (dashboard, profile, offer letter,
// certificate) — handles the localStorage token check, session
// verification, and redirect-to-login, so that logic exists in exactly
// one place instead of once per page.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getInternSession } from "@/server-functions/intern-auth";

export function useInternSession() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [internName, setInternName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("internToken");
    if (!t) {
      navigate({ to: "/intern/auth" });
      return;
    }
    (async () => {
      try {
        const session = await getInternSession({ data: { token: t } });
        setInternName(session.intern.name);
        setToken(t);
      } catch {
        localStorage.removeItem("internToken");
        navigate({ to: "/intern/auth" });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  function signOut() {
    localStorage.removeItem("internToken");
    navigate({ to: "/intern/auth" });
  }

  return { token, internName, loading, signOut };
}
