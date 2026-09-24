import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { IconLoader2 as Loader2, IconChevronDown as ChevronDown, IconLifebuoy as LifeBuoy, IconClock as Clock } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { submitPlatformTicket, listMyPlatformTickets } from "@/server-functions/student-data";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/lecture/$sessionId")({
  component: HelpPage,
});

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string | null;
};

const FAQS = [
  {
    q: "How do I purchase a test series or mentorship batch?",
    a: "Open any batch from your dashboard and tap \"Purchase Batch\" — you'll be taken through a secure Razorpay checkout. Once payment is confirmed, everything unlocks immediately, no page reload needed.",
  },
  {
    q: "Where can I see everything I've bought?",
    a: "Head to \"My Purchases\" from the profile menu in the top-right — it lists every test series and mentorship batch tied to your account.",
  },
  {
    q: "I attempted a test — where do I see my results?",
    a: "Right after submitting, you're taken to a detailed result page with your score, subject-wise breakdown, and a leaderboard. You can also revisit \"View Analysis\" from the batch's Tests tab any time to see your full attempt history.",
  },
  {
    q: "Can I retake a test?",
    a: "Yes — the Tests tab shows a \"Retake test\" option once you've attempted a test at least once. Retaking creates a new attempt; your analysis page tracks all of them.",
  },
  {
    q: "How do I contact a mentor directly?",
    a: "Mentorship batch pages show your assigned mentor's profile under the Overview tab. For anything else, use the ticket form below or the batch-specific Help tab.",
  },
  {
    q: "What if my payment succeeded but the batch didn't unlock?",
    a: "This is rare but can happen if your connection drops right after payment. Submit a ticket below with your payment ID (visible in your Razorpay confirmation email) and our team will verify and unlock it manually.",
  },
];

function HelpPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function refreshTickets() {
    if (!user) return;
    const token = await user.getIdToken();
    const { tickets: rows } = await listMyPlatformTickets({ data: { token } });
    setTickets(rows);
  }

  useEffect(() => {
    refreshTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      const token = await user.getIdToken();
      await submitPlatformTicket({ data: { token, subject, message } });
      setSent(true);
      setSubject("");
      setMessage("");
      await refreshTickets();
    } finally {
      setSending(false);
    }
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

      <AppHeader user={user} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Help &amp; Support
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Platform-wide FAQs, and a place to reach us for anything else.
          </p>
        </div>

        {/* FAQs */}
        <div className="clay mb-6 p-5 sm:p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Frequently asked questions
          </p>
          <div className="space-y-2">
            {FAQS.map((f, i) => (
              <div key={i} className="clay-inset rounded-2xl px-4 py-3">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-semibold text-foreground">{f.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-foreground/40 transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && <p className="mt-2 text-sm text-foreground/60">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* General ticket form */}
        <div className="clay mb-6 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-foreground/60" />
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Still stuck? Raise a general query
            </p>
          </div>
          <p className="mb-4 text-xs text-foreground/50">
            For questions about a specific batch you've purchased (a particular test, mentor, or
            announcement), use the Help tab inside that batch instead — it routes directly to the
            right context. Use this form for anything platform-wide: account issues, payment
            problems, or general feedback.
          </p>

          {sent && (
            <p className="mb-4 rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2 text-xs font-medium text-foreground">
              Ticket submitted — our team will follow up with you.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your question or issue…"
              rows={4}
              className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending}
              className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
            </button>
          </form>
        </div>

        {/* Ticket history */}
        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-foreground/60" />
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Your tickets</p>
          </div>
          {tickets === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
            </div>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-foreground/60">No tickets submitted yet.</p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id} className="clay-inset px-4 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{t.subject}</p>
                    <span className="rounded-full bg-[var(--sky-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      {t.status}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/60">{t.message}</p>
                  <p className="mt-1 text-xs text-foreground/40">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}