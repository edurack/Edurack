import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconClock as Clock, IconSparkles as Sparkles, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { listPublicFreeMentorSessions } from "@/server-functions/student-sessions";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";

const PINK_SOFT = "var(--pink-soft, #FCE7F3)";
const PINK_DEEP = "var(--pink-deep, #BE185D)";

type FreeSessionCard = PublicMentorOffering & { nextSlot: OpenSlot };

// Drop this component wherever it fits editorially on the public landing
// page (src/routes/index.tsx) — right after the hero is the obvious spot
// given it's meant to be a headline USP, but it's fully self-contained so
// it works anywhere. Renders nothing (returns null) if there are no free
// sessions open right now, rather than showing an empty/broken-looking
// section on a marketing page.
//
// No auth required to view — clicking a card sends the visitor to the
// now-public /mentor-session/$offeringId page, which itself only asks
// them to sign in at the moment they actually try to book.
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
      <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5" style={{ color: PINK_DEEP }}>
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Free, right now</span>
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Live sessions with real mentors — free
          </h2>
          <p className="mt-1 text-sm text-foreground/60">Book a slot with a mentor who's cracked the exam you're prepping for. No cost, no catch.</p>
        </div>
      </div>

      {sessions === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="clay h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              to="/mentor-session/$offeringId"
              params={{ offeringId: s.id }}
              className="clay flex flex-col overflow-hidden p-3 transition-transform duration-200 hover:border-primary/60"
            >
              <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-2xl" style={{ background: `linear-gradient(135deg, ${PINK_SOFT}, var(--sky-soft))` }}>
                {s.thumbnailUrl ? (
                  <img src={s.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Sparkles className="h-8 w-8 opacity-40" style={{ color: PINK_DEEP }} strokeWidth={1.5} />
                )}
                {s.subject && (
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold text-foreground/70 shadow-sm">
                    {s.subject}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3 pt-4">
                <div className="mb-1 flex items-center gap-2">
                  {s.mentorPhotoUrl ? (
                    <img src={s.mentorPhotoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: PINK_SOFT, color: PINK_DEEP }}>
                      {s.mentorName.charAt(0)}
                    </div>
                  )}
                  <span className="truncate text-xs font-semibold text-foreground/60">{s.mentorName}</span>
                </div>
                <h3 className="mb-2 font-display text-base font-bold leading-tight text-foreground">{s.title}</h3>
                <p className="mb-4 flex items-center gap-1 text-xs text-foreground/50">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(s.nextSlot.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · {s.nextSlot.startTime}
                </p>
                <span
                  className="mt-auto flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold text-white transition-transform duration-200"
                  style={{ background: PINK_DEEP }}
                >
                  Book free — it's on us
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}