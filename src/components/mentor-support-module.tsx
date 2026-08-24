import { useEffect, useState, type FormEvent } from "react";
import { Loader2, LifeBuoy, Send, Clock, CheckCircle2, MessageCircle, Plus, X } from "lucide-react";
import type { TicketCategory, MentorSupportTicket } from "@/lib/admin-types";
import { submitMentorTicket, listMyMentorTickets } from "@/server-functions/mentor-portal";
import { ModuleHeader, ClayField, Panel, LoadingBlock, EmptyState, ErrorBanner, SuccessBanner, inputClass, textareaClass } from "@/components/mentor-portal-ui";

const CATEGORIES: TicketCategory[] = ["Technical Issue", "Batch/Student Error", "Payout Queries", "General Doubts"];

export function MentorSupportModule({ mentorToken }: { mentorToken: string }) {
  const [tickets, setTickets] = useState<MentorSupportTicket[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const { tickets: rows } = await listMyMentorTickets({ data: { token: mentorToken } });
    setTickets(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  const openCount = tickets?.filter((t) => t.status !== "Resolved").length ?? 0;

  return (
    <div>
      <ModuleHeader
        title="Internal Operations Help Desk"
        subtitle="Raise an issue with Team Edurack and track its resolution here."
      />

      {tickets && openCount > 0 && !showForm && (
        <div className="clay-inset mb-4 flex items-center gap-2 rounded-2xl bg-[var(--sky-soft)]/40 px-4 py-3 text-sm text-foreground/70">
          <Clock className="h-4 w-4 shrink-0" />
          <p>
            <strong>{openCount}</strong> ticket{openCount !== 1 ? "s" : ""} still open.
          </p>
        </div>
      )}

      {showForm && (
        <TicketForm
          mentorToken={mentorToken}
          onSubmitted={() => {
            setShowForm(false);
            refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <TicketTimeline
        tickets={tickets}
        action={
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
            >
              <Plus className="h-3.5 w-3.5" /> Raise a ticket
            </button>
          )
        }
      />
    </div>
  );
}

function TicketForm({
  mentorToken,
  onSubmitted,
  onCancel,
}: {
  mentorToken: string;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<TicketCategory>("Technical Issue");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!message.trim()) return setError("Describe the issue before submitting.");

    setSaving(true);
    try {
      await submitMentorTicket({ data: { token: mentorToken, category, message: message.trim() } });
      setMessage("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the ticket. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6">
      <Panel
        icon={LifeBuoy}
        title="Raise a ticket"
        action={
          <button onClick={onCancel} className="text-foreground/40 hover:text-foreground/70">
            <X className="h-4 w-4" />
          </button>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <ClayField label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={inputClass + " appearance-none"}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </ClayField>

          <ClayField label="Message">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Describe the issue in detail — what happened, when, and what you expected instead…"
              className={textareaClass}
            />
          </ClayField>

          {error && <ErrorBanner message={error} />}

          <button
            type="submit"
            disabled={saving}
            className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
          </button>
        </form>
      </Panel>
    </div>
  );
}

function statusStyles(status: string) {
  switch (status) {
    case "Resolved":
      return "bg-[var(--mint-soft)]/60 text-foreground";
    case "In Progress":
      return "bg-[var(--lemon-soft)]/70 text-foreground";
    default:
      return "bg-foreground/5 text-foreground/60";
  }
}

function statusIcon(status: string) {
  if (status === "Resolved") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "In Progress") return <Clock className="h-3 w-3" />;
  return <MessageCircle className="h-3 w-3" />;
}

function TicketTimeline({ tickets, action }: { tickets: MentorSupportTicket[] | null; action?: React.ReactNode }) {
  return (
    <Panel icon={Send} title="Ticket log" action={action}>
      {tickets === null ? (
        <LoadingBlock compact />
      ) : tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} message="No tickets filed yet." />
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className="clay-inset px-4 py-3.5">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="clay-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
                  {t.category}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusStyles(t.status)}`}>
                    {statusIcon(t.status)}
                    {t.status}
                  </span>
                  <span className="text-xs text-foreground/40">{t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}</span>
                </div>
              </div>

              <p className="mb-2 text-sm text-foreground">{t.message}</p>

              {t.adminResponse ? (
                <div className="clay mt-2 rounded-2xl px-3.5 py-2.5">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--sky-deep)]">
                    Team Edurack response
                    {t.respondedAt && ` · ${new Date(t.respondedAt).toLocaleString()}`}
                  </p>
                  <p className="text-sm text-foreground/80">{t.adminResponse}</p>
                </div>
              ) : (
                <p className="text-xs italic text-foreground/40">Awaiting a response from Team Edurack.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}