// Small presentational pieces shared by every place a session shows up
// (browse, detail page, landing, My Sessions, booking flow). One look, one
// set of labels — previously each screen formatted price, format and seats
// slightly differently.
import { IconUsers as Users, IconVideo as Video } from "@tabler/icons-react";
import { formatForOffering, isUnlimitedOffering, type OpenSlot, type PublicMentorOffering } from "@/lib/session-types";
import type { SessionPhase } from "@/lib/session-time";

export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const priceLabel = (o: { isFree: boolean; price: number }) => (o.isFree ? "Free" : inr.format(o.price));

export function formatLabel(o: { capacity: number; isFree: boolean }): string {
  const f = formatForOffering(o);
  if (f === "one_on_one") return "1:1";
  if (f === "open_unlimited") return "Open to everyone";
  return `Group · up to ${o.capacity}`;
}

/** "3 seats left" / "Only 1 seat left" / null for 1:1 and open sessions. */
export function seatsNote(o: { capacity: number; isFree: boolean }, slot: Pick<OpenSlot, "seatsRemaining">): { text: string; urgent: boolean } | null {
  if (o.capacity <= 1 || isUnlimitedOffering(o)) return null;
  const n = slot.seatsRemaining;
  if (n <= 3) return { text: n === 1 ? "Only 1 seat left" : `Only ${n} seats left`, urgent: true };
  return { text: `${n} seats left`, urgent: false };
}

// Mentors upload a 4:5 portrait poster, but cards are landscape — cropping it
// (which my first pass did) cuts off the text printed on the poster. So a
// poster is shown whole, contained, over a blurred copy of itself; a plain
// thumbnail or profile photo still fills the frame.
export function SessionCover({ offering, className = "" }: { offering: PublicMentorOffering; className?: string }) {
  const poster = offering.posterUrl ?? null;
  const fallback = offering.thumbnailUrl ?? offering.mentorPhotoUrl ?? null;
  return (
    <div className={`relative overflow-hidden bg-primary/10 ${className}`}>
      {poster ? (
        <>
          <img src={poster} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-xl" />
          <img src={poster} alt="" loading="lazy" className="relative h-full w-full object-contain" />
        </>
      ) : fallback ? (
        <img src={fallback} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
      ) : (
        <div className="grid h-full w-full place-items-center text-primary/50">
          <Video className="h-9 w-9" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

export function MentorAvatar({ name, photoUrl, size = 24 }: { name: string; photoUrl: string | null; size?: number }) {
  return photoUrl ? (
    <img src={photoUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function FormatBadge({ offering, className = "" }: { offering: { capacity: number; isFree: boolean }; className?: string }) {
  const f = formatForOffering(offering);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-foreground/75 ${className}`}>
      {f !== "one_on_one" && <Users className="h-3 w-3" />}
      {formatLabel(offering)}
    </span>
  );
}

const PHASE_STYLE: Record<SessionPhase, { label: string; cls: string }> = {
  scheduled: { label: "Upcoming", cls: "bg-primary/10 text-primary" },
  joinable: { label: "Starting soon", cls: "bg-amber-100 text-amber-900" },
  live: { label: "Live now", cls: "bg-emerald-100 text-emerald-900" },
  completed: { label: "Completed", cls: "bg-secondary text-foreground/70" },
  missed: { label: "Missed", cls: "bg-secondary text-foreground/70" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-900" },
};

export function PhasePill({ phase }: { phase: SessionPhase }) {
  const s = PHASE_STYLE[phase];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>;
}
