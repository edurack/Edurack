import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  IconLoader2 as Loader2,
  IconChevronDown as ChevronDown,
  IconLifebuoy as LifeBuoy,
  IconClock as Clock,
  IconHelpCircle as HelpCircle,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { submitPlatformTicket, listMyPlatformTickets } from "@/server-functions/student-data";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/help")({
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

// Same entrance motion dashboard.tsx uses for its cards, so panels on this
// page animate in exactly the way panels do on /dashboard.
function fadeUp(i: number) {
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] as const },
  };
}

// Same card shell as dashboard.tsx's Panel: rounded-3xl surface, bold
// display-font title row with an optional right-aligned action.
function Panel({
  title,
  icon: Icon,
  action,
  index,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: ReactNode;
  index: number;
  children: ReactNode;
}) {
  return (
    <motion.section {...fadeUp(index)} className="min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <h2 className="font-display text-base font-extrabold tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

const linkAction = "inline-flex min-h-9 items-center text-sm font-bold text-primary hover:underline";

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
    <div className="min-h-screen bg-background">
      <AppHeader user={user} />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-muted-foreground">We're here to help</p>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
            Help &amp; Support
          </h1>
        </div>

        <div className="flex flex-col gap-4">
          {/* FAQs */}
          <Panel title="Frequently asked questions" icon={HelpCircle} index={0}>
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
          </Panel>

          {/* General ticket form */}
          <Panel title="Still stuck? Raise a query" icon={LifeBuoy} index={1}>
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
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
              </button>
            </form>
          </Panel>

          {/* Ticket history */}
          <Panel
            title="Your tickets"
            icon={Clock}
            index={2}
            action={
              tickets && tickets.length > 0 ? (
                <Link to="/tickets" className={linkAction}>
                  View all
                </Link>
              ) : undefined
            }
          >
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
          </Panel>
        </div>
      </main>
    </div>
  );
}