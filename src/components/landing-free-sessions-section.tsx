import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight, IconClock as Clock } from "@tabler/icons-react";
import { listPublicFreeMentorSessions } from "@/server-functions/student-sessions";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";
import { formatSlot } from "@/lib/session-time";
import { FormatBadge, MentorAvatar, SessionCover, seatsNote } from "@/components/sessions/session-ui";

type FreeSessionCard = PublicMentorOffering & { nextSlot: OpenSlot };

// Self-contained marketing section for the public landing page. Renders
// nothing when there are no free sessions open, rather than an empty block.
// No auth to browse — cards open the public /mentor-session/$offeringId page,
// which only asks the visitor to sign in at the moment they book.
export function LandingFreeSessionsSection() {
  const [sessions, setSessions] = useState<FreeSessionCard[] | null>(null);

  useEffect(() => {
    listPublicFreeMentorSessions({ data: { limit: 6 } })
      .then(({ sessions: rows }) => setSessions(rows as FreeSessionCard[]))
      .catch(() => setSessions([]));
  }, []);

  if (sessions !== null && sessions.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-6 max-w-2xl">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Talk to someone who's already done it. Free.</h2>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
          Live sessions with mentors who cracked the exam you're preparing for. Pick a time that works, no payment needed.
        </p>
        <Link to="/mentorship-sessions" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Browse all mentorship sessions
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {sessions === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-3xl bg-secondary" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => {
            const seats = seatsNote(s, s.nextSlot);
            return (
              <Link
                key={s.id}
                to="/mentor-session/$offeringId"
                params={{ offeringId: s.id }}
                className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-colors hover:border-foreground/40"
              >
                <div className="relative">
                  <SessionCover offering={s} className="aspect-[16/10] w-full" />
                  {s.subject && <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-primary">{s.subject}</span>}
                  <FormatBadge offering={s} className="absolute right-3 top-3" />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    <MentorAvatar name={s.mentorName} photoUrl={s.mentorPhotoUrl} size={22} />
                    <span className="truncate text-xs font-semibold text-muted-foreground">{s.mentorName}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{s.durationMinutes} min</span>
                  </div>
                  <h3 className="mt-1.5 font-display text-lg font-bold leading-snug tracking-tight">{s.title}</h3>
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {formatSlot(s.nextSlot.date, s.nextSlot.startTime)}
                    {seats && <span className={`ml-auto text-xs font-bold ${seats.urgent ? "text-amber-700" : "text-muted-foreground"}`}>{seats.text}</span>}
                  </p>
                  <span className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background">
                    Reserve a free seat
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
