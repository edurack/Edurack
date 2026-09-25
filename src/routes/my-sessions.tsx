import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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

const when = (r: Row) => new Date(`${r.session_date}T${r.start_time}:00`);
const STATUS_LABEL: Record<Row["status"], string> = { upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", no_show: "Missed" };

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

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const list = rows ?? [];
    const isPast = (r: Row) => when(r) < now || r.status !== "upcoming";
    return {
      upcoming: list.filter((r) => !isPast(r)).sort((a, b) => when(a).getTime() - when(b).getTime()),
      past: list.filter(isPast).sort((a, b) => when(b).getTime() - when(a).getTime()),
    };
  }, [rows]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        <Link to="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-foreground">← Dashboard</Link>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
          <span className="block font-light">Your</span>
          <span className="block font-extrabold">sessions</span>
        </h1>

        <div className="mt-6 inline-flex rounded-full border border-border p-1">
          {([["upcoming", "Upcoming", upcoming.length], ["past", "Past", past.length]] as const).map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`min-h-10 rounded-full px-5 text-sm font-bold transition-colors ${tab === k ? "bg-foreground text-background" : "text-foreground/70"}`}>
              {label}{rows && n > 0 ? ` · ${n}` : ""}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {rows === null ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-secondary" />)}</div>
          ) : shown.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">{tab === "upcoming" ? "No upcoming sessions." : "No past sessions yet."}</p>
              {tab === "upcoming" && <Link to="/dashboard" className="clay-btn mt-4 inline-flex min-h-11 items-center px-6 text-sm">Browse sessions</Link>}
            </div>
          ) : (
            <ul className="space-y-3">
              {shown.map((r) => {
                const d = when(r);
                const live = tab === "upcoming";
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl border border-border bg-card p-4">
                    <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-center ${live ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                      <div>
                        <p className="font-display text-2xl font-extrabold leading-none">{d.getDate()}</p>
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide opacity-80">{d.toLocaleDateString("en-IN", { month: "short" })}</p>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-display text-base font-bold leading-snug">{r.mentor_session_offerings?.title ?? "Mentor session"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.start_time} · {r.duration_minutes} min · {r.is_free ? "Free" : currency.format(r.price)}
                        {!live && <span className="ml-2 rounded-full border border-border px-2 py-0.5 font-bold">{STATUS_LABEL[r.status]}</span>}
                      </p>
                    </div>
                    {live && r.meeting_link && (
                      <a href={r.meeting_link} target="_blank" rel="noreferrer" className="clay-btn inline-flex min-h-11 w-full items-center justify-center gap-1.5 px-4 text-sm sm:w-auto">
                        <LinkIcon className="h-4 w-4" />Join
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}