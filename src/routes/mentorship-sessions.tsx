import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IconCalendarEvent as CalendarEvent, IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { SITE_URL, breadcrumbJsonLd, pageHead } from "@/lib/seo";
import { SESSIONS_HUB_PATH } from "@/lib/session-seo";
import { listPublicMentorSessions } from "@/server-functions/public-sessions";
import { SessionCard } from "@/components/sessions/session-card";
import { SiteHeader, SiteFooter, WRAP } from "@/components/landing/site-chrome";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How does a mentorship session work?",
    a: "Open any session, pick a time that suits you and book it (sign-in is only needed at that last step). The mentor shares the meeting link before the session starts, and you get a reminder email.",
  },
  {
    q: "Who are the mentors?",
    a: "Students who have already cleared the exam you are preparing for. Each mentor's rank and college are shown on their profile, and Edurack verifies the credentials they claim.",
  },
  {
    q: "What is the difference between 1:1 and group sessions?",
    a: "A 1:1 session is just you and the mentor. A group session has a limited number of seats per time slot, so you can see how many seats are left before you book. Some sessions are open to everyone.",
  },
  {
    q: "Are the sessions free?",
    a: "It depends on the mentor. Some sessions are free and others are paid. The price is shown on every card and on the session page before you book.",
  },
  {
    q: "Can I cancel a booking?",
    a: "Yes. Free sessions can be cancelled any time before they start. For paid sessions you get a full refund when you cancel at least 24 hours ahead. If a mentor cancels, you are refunded.",
  },
  {
    q: "Which time zone are the slots in?",
    a: "All times are in Indian Standard Time (IST).",
  },
];

export const Route = createFileRoute("/mentorship-sessions")({
  // Runs on the server so crawlers receive the actual list of sessions as
  // links in the HTML, not an empty shell that fills in after JavaScript.
  loader: async () => {
    try {
      const { sessions } = await listPublicMentorSessions({ data: {} });
      return { sessions };
    } catch {
      return { sessions: [] };
    }
  },
  head: ({ loaderData }) =>
    pageHead({
      title: "Mentorship Sessions with NEET & JEE Rankers",
      path: SESSIONS_HUB_PATH,
      description:
        "Book live 1:1 and group mentorship sessions with students who cracked NEET and JEE. Pick a time, see the price up front, and get the exact strategy that worked for them.",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Mentorship sessions on Edurack",
          url: `${SITE_URL}${SESSIONS_HUB_PATH}`,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: (loaderData?.sessions ?? []).slice(0, 30).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}/mentor-session/${s.id}`,
              name: `${s.title} with ${s.mentorName}`,
            })),
          },
        },
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Mentorship sessions", path: SESSIONS_HUB_PATH },
        ]),
      ],
    }),
  component: MentorshipSessionsPage,
});

function MentorshipSessionsPage() {
  const { sessions } = Route.useLoaderData();
  const [subject, setSubject] = useState<string | null>(null);

  const subjects = useMemo(() => Array.from(new Set(sessions.map((s) => (s.subject ?? "").trim()).filter(Boolean))).sort(), [sessions]);
  const shown = subject ? sessions.filter((s) => (s.subject ?? "").trim() === subject) : sessions;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="py-12 sm:py-16">
          <div className={WRAP}>
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground hover:underline">
                Home
              </Link>
              <span className="mx-1.5">›</span>
              <span className="font-semibold text-foreground">Mentorship sessions</span>
            </nav>

            <div className="mt-5 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary sm:text-sm">
                <CalendarEvent className="h-4 w-4" />
                Live sessions
              </div>
              <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                <span className="block font-light">Mentorship sessions with</span>
                <span className="block font-extrabold">people who cracked the exam.</span>
              </h1>
              <p className="mt-4 text-muted-foreground">
                Book a live 1:1 or group session with a mentor who has already cleared NEET or JEE. Ask about your study plan, your weak subjects or how to handle the last
                90 days, and get advice from someone who has just been through it. Every mentor's rank and college is verified and shown on their profile.
              </p>
            </div>

            {subjects.length > 1 && (
              <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by subject">
                <button
                  type="button"
                  onClick={() => setSubject(null)}
                  aria-pressed={subject === null}
                  className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${subject === null ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"}`}
                >
                  All
                </button>
                {subjects.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(subject === s ? null : s)}
                    aria-pressed={subject === s}
                    className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${subject === s ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-dashed border-border p-10 text-center">
                <p className="font-semibold">No open sessions right now</p>
                <p className="mt-1 text-sm text-muted-foreground">Mentors publish new times all the time. Check back soon, or take a free CBT mock test while you wait.</p>
                <Link to="/simulator/live" className="clay-btn mt-5 inline-flex min-h-11 items-center px-6 text-sm">
                  Try a free mock test
                </Link>
              </div>
            ) : (
              <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((s) => (
                  <li key={s.id}>
                    <SessionCard s={s} />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-16 max-w-3xl">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Questions about mentorship sessions</h2>
              <div className="mt-5 space-y-3">
                {FAQS.map((f) => (
                  <details key={f.q} className="group clay overflow-hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-display font-bold text-foreground sm:px-6">
                      {f.q}
                      <ChevronDown className="h-5 w-5 shrink-0 text-foreground/40 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6">{f.a}</p>
                  </details>
                ))}
              </div>
              <p className="mt-8 text-sm text-muted-foreground">
                Cleared the exam yourself?{" "}
                <Link to="/join-mentor" className="font-semibold text-foreground hover:underline">
                  Become a mentor
                </Link>{" "}
                and host your own sessions.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
