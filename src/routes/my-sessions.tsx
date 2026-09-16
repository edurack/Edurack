import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconLoader2 as Loader2, IconLink as LinkIcon } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { listMyBookedSessions } from "@/server-functions/student-sessions";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/my-sessions")({
  component: MySessionsPage,
});

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type Row = {
  id: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  price: number;
  is_free: boolean;
  status: "upcoming" | "completed" | "cancelled" | "no_show";
  meeting_link: string | null;
  mentor_session_offerings?: { title: string };
};

function MySessionsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const { bookings } = await listMyBookedSessions({ data: { token } });
      setRows(bookings as Row[]);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const now = new Date();
    return rows.filter((r) => {
      const isPast = new Date(`${r.session_date}T${r.start_time}:00`) < now || r.status !== "upcoming";
      return tab === "upcoming" ? !isPast : isPast;
    });
  }, [rows, tab]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-foreground">My Sessions</h1>

        <div className="mb-5 flex gap-2">
          <button onClick={() => setTab("upcoming")} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === "upcoming" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}>
            Upcoming
          </button>
          <button onClick={() => setTab("past")} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === "past" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}>
            Past
          </button>
        </div>

        {rows === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="clay p-8 text-center text-sm text-foreground/60">{tab === "upcoming" ? "No upcoming sessions." : "No past sessions yet."}</div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id} className="clay-inset flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{r.mentor_session_offerings?.title ?? "Session"}</p>
                  <p className="text-xs text-foreground/50">
                    {new Date(r.session_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {r.start_time} ·{" "}
                    {r.is_free ? "Free" : currency.format(r.price)} · {r.status}
                  </p>
                </div>
                {r.meeting_link && r.status === "upcoming" && (
                  <a href={r.meeting_link} target="_blank" rel="noreferrer" className="clay-btn-ghost inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--sky-deep)]">
                    <LinkIcon className="h-3.5 w-3.5" />
                    Join
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}