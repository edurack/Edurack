import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  LifeBuoy,
  Send,
  Inbox,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  MessageSquareText,
} from "lucide-react";
import { submitPromoterTicket, listMyPromoterTickets } from "@/server-functions/promoter-portal";
import type { PromoterSupportTicket, PromoterTicketCategory } from "@/lib/promoter-types";

const CATEGORIES: PromoterTicketCategory[] = ["Payout Queries", "Coupon / Batch Issue", "Account Issue", "Other"];

const inputClass =
  "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <Inbox className="h-5 w-5 text-foreground/30" />
      </div>
      <p className="text-sm text-foreground/60">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <AlertCircle className="h-5 w-5 text-foreground/40" />
      </div>
      <p className="max-w-sm text-sm text-foreground/60">{message}</p>
      <button
        onClick={onRetry}
        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

export function PromoterHelpModule({ getToken }: { getToken: () => string }) {
  const [tickets, setTickets] = useState<PromoterSupportTicket[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  async function load() {
    setStatus("loading");
    try {
      const result = await listMyPromoterTickets({ data: { token: getToken() } });
      setTickets(result.tickets as PromoterSupportTicket[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Help / Support</h1>
        <p className="mt-1 text-sm text-foreground/60">Raise a ticket or check on one you've already filed.</p>
      </div>

      <RaiseTicketForm getToken={getToken} onSubmitted={load} />

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Your tickets</h2>
        </div>

        {status === "loading" ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="clay-inset h-20 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : status === "error" ? (
          <ErrorState message="Couldn't load your tickets." onRetry={load} />
        ) : !tickets || tickets.length === 0 ? (
          <EmptyState message="No tickets raised yet." />
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RaiseTicketForm({ getToken, onSubmitted }: { getToken: () => string; onSubmitted: () => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<PromoterTicketCategory>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!subject.trim()) return setError("Enter a subject.");
    if (!description.trim()) return setError("Describe the issue.");

    setSubmitting(true);
    try {
      await submitPromoterTicket({
        data: { token: getToken(), ticket: { subject: subject.trim(), category, description: description.trim() } },
      });
      setSubject("");
      setDescription("");
      setCategory(CATEGORIES[0]);
      setSuccess(true);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your ticket. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Raise a ticket</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Issue type
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  category === c ? "clay-btn text-white" : "clay-chip text-foreground/70"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className={inputClass}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue…"
          rows={4}
          className={inputClass}
        />

        {error && (
          <p className="rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-xs font-medium text-foreground">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">
            Ticket submitted.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Submit</>}
        </button>
      </form>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: PromoterSupportTicket }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="clay-inset rounded-2xl p-4">
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="clay-chip px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/60">
              {ticket.category}
            </span>
            <StatusBadge status={ticket.status} />
          </div>
          <p className="truncate text-sm font-semibold text-foreground">{ticket.subject}</p>
        </div>
        <span className="shrink-0 text-xs text-foreground/40">{formatDate(ticket.createdAt)}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-foreground/10 pt-3">
          <p className="text-sm text-foreground/70">{ticket.description}</p>
          {ticket.adminResponse ? (
            <div className="clay-inset rounded-xl bg-[var(--mint-soft)]/30 px-3.5 py-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40">Edurack's reply</p>
              <p className="text-sm text-foreground/80">{ticket.adminResponse}</p>
            </div>
          ) : (
            <p className="text-xs italic text-foreground/40">No reply yet — we'll get back to you soon.</p>
          )}
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: PromoterSupportTicket["status"] }) {
  if (status === "Resolved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
        <CheckCircle2 className="h-3 w-3" /> Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--coral-soft)]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
      <Clock className="h-3 w-3" /> {status}
    </span>
  );
}