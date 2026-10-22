import { Link } from "@tanstack/react-router";
import { IconArrowRight as ArrowRight, IconClock as Clock } from "@tabler/icons-react";
import type { PublicSessionCard } from "@/server-functions/public-sessions";
import { formatSlot } from "@/lib/session-time";
import { FormatBadge, MentorAvatar, SessionCover, priceLabel, seatsNote } from "./session-ui";

// One browsable session card, shared by the /mentorship-sessions hub and a
// mentor's public profile. It's a real <a href> to the session page, so
// crawlers (and people with JS off) can follow it.
export function SessionCard({ s }: { s: PublicSessionCard }) {
  const seats = seatsNote(s, s.nextSlot);
  return (
    <Link
      to="/mentor-session/$offeringId"
      params={{ offeringId: s.id }}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card transition-colors hover:border-foreground/40"
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
          {s.isFree ? "Reserve a free seat" : `Book · ${priceLabel(s)}`}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
