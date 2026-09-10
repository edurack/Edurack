import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconLoader2 as Loader2, IconLifebuoy as LifeBuoy, IconSearch as Search, IconStar as Star, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { MessageSquareText, Inbox, RefreshCw } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { listMyAllTickets, rateTicketResponse } from "@/server-functions/student-data";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/tickets")({
  component: MyTicketsPage,
});

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  source: { type: "platform" } | { type: "bundle" | "mentorship"; itemTitle: string };
  adminReply: string | null;
  repliedAt: string | null;
  rating: number | null;
  createdAt: string | null;
};

type StatusFilter = "all" | "open" | "resolved";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function SourceBadge({ source }: { source: Ticket["source"] }) {
  if (source.type === "platform") {
    return (
      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/60">
        General query
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        source.type === "bundle" ? "bg-[var(--sky-soft)] text-foreground" : "bg-[var(--mint-soft)] text-foreground"
      }`}
    >
      Sent from: {source.itemTitle}
    </span>
  );
}

function MyTicketsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function load() {
    if (!user) return;
    setStatus("loading");
    try {
      const token = await user.getIdToken();
      const { tickets: rows } = await listMyAllTickets({ data: { token } });
      setTickets(rows as Ticket[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    if (!tickets) return [];
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !t.subject.toLowerCase().includes(q) && !t.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, query, statusFilter]);

  function handleRated(ticketId: string, rating: number) {
    setTickets((prev) => prev?.map((t) => (t.id === ticketId ? { ...t, rating } : t)) ?? null);
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-foreground/60" />
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              My Tickets
            </h1>
            <p className="mt-0.5 text-sm text-foreground/60">
              Every query you've raised — general, or from a specific batch — in one place.
            </p>
          </div>
        </div>

        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your tickets…"
                className="clay-inset w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "open", "resolved"] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    statusFilter === f ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  {f === "all" ? "All" : f === "open" ? "Awaiting reply" : "Answered"}
                </button>
              ))}
            </div>
          </div>

          {status === "loading" ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="clay-inset h-32 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
                <AlertCircle className="h-5 w-5 text-foreground/40" />
              </div>
              <p className="text-sm text-foreground/60">Couldn't load your tickets.</p>
              <button
                onClick={load}
                className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
                <Inbox className="h-5 w-5 text-foreground/30" />
              </div>
              <p className="text-sm text-foreground/60">
                {tickets && tickets.length > 0 ? "No tickets match your search." : "You haven't raised any tickets yet."}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((t) => (
                <li key={t.id} className="clay-inset rounded-2xl p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SourceBadge source={t.source} />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          t.status === "resolved"
                            ? "bg-[var(--mint-soft)] text-foreground"
                            : "bg-[var(--coral-soft)]/60 text-foreground"
                        }`}
                      >
                        {t.status === "resolved" ? "Answered" : "Awaiting reply"}
                      </span>
                    </div>
                    <span className="text-xs text-foreground/40">{formatDateTime(t.createdAt)}</span>
                  </div>

                  <p className="text-sm font-semibold text-foreground">{t.subject}</p>
                  <p className="mt-1 text-sm text-foreground/70">{t.message}</p>

                  {t.adminReply ? (
                    <div className="clay-inset mt-3 rounded-xl px-4 py-3">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <MessageSquareText className="h-3.5 w-3.5 text-foreground/40" />
                        <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/40">
                          Response · {formatDateTime(t.repliedAt)}
                        </p>
                      </div>
                      <p className="text-sm text-foreground/80">{t.adminReply}</p>

                      <div className="mt-3 flex items-center gap-2 border-t border-foreground/5 pt-3">
                        <span className="text-xs font-semibold text-foreground/60">
                          {t.rating ? "Your rating:" : "Rate this response:"}
                        </span>
                        <StarRatingInput
                          ticketId={t.id}
                          value={t.rating}
                          onRated={(rating) => handleRated(t.id, rating)}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs italic text-foreground/40">
                      No response yet — we'll notify you once someone replies.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function StarRatingInput({
  ticketId,
  value,
  onRated,
}: {
  ticketId: string;
  value: number | null;
  onRated: (rating: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  async function handleClick(rating: number) {
    if (!user || value || submitting) return; // locked once rated
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      await rateTicketResponse({ data: { token, ticketId, rating } });
      onRated(rating);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        const filled = value ? starValue <= value : hovered !== null && starValue <= hovered;
        return (
          <button
            key={i}
            type="button"
            disabled={!!value || submitting}
            onMouseEnter={() => !value && setHovered(starValue)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleClick(starValue)}
            className={`transition-transform duration-150 ${!value ? "hover:scale-110" : "cursor-default"}`}
            aria-label={`Rate ${starValue} star${starValue > 1 ? "s" : ""}`}
          >
            <Star
              className={`h-4 w-4 ${
                filled ? "fill-[var(--sky-deep)] text-[var(--sky-deep)]" : "text-foreground/20"
              }`}
            />
          </button>
        );
      })}
      {submitting && <Loader2 className="ml-1 h-3 w-3 animate-spin text-foreground/40" />}
    </div>
  );
}