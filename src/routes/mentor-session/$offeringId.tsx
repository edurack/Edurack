import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { pageHead, noindexHead, SITE_URL } from "@/lib/seo";
import { useEffect, useMemo, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconClock as Clock,
  IconArrowLeft as ArrowLeft,
  IconSchool as GraduationCap,
  IconTrophy as Trophy,
  IconArrowRight as ArrowRight,
  IconLogin as LogIn,
  IconCircleCheck as CircleCheck,
  IconCalendarEvent as CalendarEvent,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { getMentorSessionOfferingDetail } from "@/server-functions/student-sessions";
import { BookingDialog } from "@/components/sessions/booking-dialog";
import { SlotPicker } from "@/components/sessions/slot-picker";
import { FormatBadge, MentorAvatar, SessionCover, formatLabel, priceLabel, seatsNote } from "@/components/sessions/session-ui";
import { AppHeader } from "@/components/app-header";
import { SESSION_FREE_CANCEL_HOURS, formatDateLong, formatSlot, formatTimeRange } from "@/lib/session-time";
import { describeSchedule, type MentorBioForOffering, type OpenSlot, type OtherOfferingSummary, type PublicMentorOffering } from "@/lib/session-types";

export const Route = createFileRoute("/mentor-session/$offeringId")({
  loader: async ({ params }) => {
    try {
      const { offering, mentorBio } = await getMentorSessionOfferingDetail({ data: { offeringId: params.offeringId } });
      const kind = offering.capacity > 1 ? "group session" : "1:1 session";
      const price = offering.isFree ? "Free" : `₹${offering.price}`;
      return {
        seo: {
          title: `${offering.title} with ${mentorBio.name}`,
          description:
            offering.description?.trim() ||
            `Book a ${offering.durationMinutes}-minute ${kind} with ${mentorBio.name} on Edurack. ${price}.`,
          image: offering.posterUrl ?? offering.thumbnailUrl ?? mentorBio.photoUrl,
          mentorName: mentorBio.name,
          price: offering.isFree ? 0 : Number(offering.price) || 0,
        },
      };
    } catch {
      return { seo: null };
    }
  },
  head: ({ loaderData, params }) => {
    const s = loaderData?.seo;
    if (!s) return noindexHead("Session unavailable");
    const path = `/mentor-session/${params.offeringId}`;
    return pageHead({
      title: s.title,
      description: s.description,
      path,
      image: s.image,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: s.title,
        description: s.description,
        provider: { "@type": "Person", name: s.mentorName },
        url: `${SITE_URL}${path}`,
        offers: { "@type": "Offer", price: s.price, priceCurrency: "INR" },
      },
    });
  },
  component: MentorSessionDetailPage,
});

type DetailData = {
  offering: PublicMentorOffering;
  mentorBio: MentorBioForOffering;
  slots: OpenSlot[];
  otherOfferings: OtherOfferingSummary[];
  myBooking: { id: string; sessionDate: string; startTime: string; meetingLink: string | null } | null;
};

// This page is intentionally public — a logged-out visitor (from the
// landing page, or a shared link) can read the full offering, the
// mentor's bio, and every open slot without signing in. Only the final
// "Book" step needs an account, and it sends them back here afterwards
// (auth.tsx honours the `redirect` search param).
function MentorSessionDetailPage() {
  const { offeringId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<OpenSlot | null>(null);
  const [booking, setBooking] = useState<OpenSlot | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = user ? await user.getIdToken() : undefined;
      const result = (await getMentorSessionOfferingDetail({ data: { token, offeringId } })) as DetailData;
      setData(result);
      setSelected((prev) => result.slots.find((s) => prev && s.date === prev.date && s.startTime === prev.startTime) ?? result.slots[0] ?? null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (loading) return; // wait for auth to resolve once, so the first load already knows if there's a user
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, offeringId]);

  function handleBook() {
    if (!selected) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/mentor-session/${offeringId}` } as any });
      return;
    }
    setBooking(selected);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {user ? <AppHeader user={user} /> : <PublicHeader offeringId={offeringId} />}
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-4 sm:px-6 lg:pb-16">
        <Link to={user ? "/dashboard" : "/"} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {user ? "Back to dashboard" : "Back to home"}
        </Link>

        {status === "loading" ? (
          <div className="space-y-4">
            <div className="aspect-[16/8] animate-pulse rounded-3xl bg-secondary" />
            <div className="h-40 animate-pulse rounded-3xl bg-secondary" />
          </div>
        ) : status === "error" || !data ? (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <p className="font-semibold">This session isn't available</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have been paused or removed by the mentor.</p>
            <Link to={user ? "/dashboard" : "/"} className="clay-btn mt-5 inline-flex min-h-11 items-center px-6 text-sm">
              Browse other sessions
            </Link>
          </div>
        ) : (
          <SessionDetail data={data} selected={selected} onSelect={setSelected} onBook={handleBook} isSignedIn={Boolean(user)} />
        )}
      </main>

      {user && data && booking && (
        <BookingDialog
          offering={data.offering}
          slot={booking}
          slots={data.slots}
          getToken={() => user.getIdToken()}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// Minimal fallback header for logged-out visitors.
function PublicHeader({ offeringId }: { offeringId: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <Link to="/" className="font-display text-base font-extrabold tracking-tight text-foreground">
        Edurack
      </Link>
      <Link
        to="/auth"
        search={{ redirect: `/mentor-session/${offeringId}` } as any}
        className="clay-btn inline-flex min-h-10 items-center gap-1.5 px-5 text-sm"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </Link>
    </header>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary px-3.5 py-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-snug">{value}</p>
    </div>
  );
}

function SessionDetail({
  data,
  selected,
  onSelect,
  onBook,
  isSignedIn,
}: {
  data: DetailData;
  selected: OpenSlot | null;
  onSelect: (s: OpenSlot) => void;
  onBook: () => void;
  isSignedIn: boolean;
}) {
  const { offering, mentorBio, otherOfferings, slots, myBooking } = data;
  const first = mentorBio.name.split(" ")[0];
  const seats = selected ? seatsNote(offering, selected) : null;
  const nextLabel = useMemo(() => (slots[0] ? formatSlot(slots[0].date, slots[0].startTime) : "None open"), [slots]);
  const ctaLabel = !isSignedIn ? "Sign in to book" : offering.isFree ? "Book free session" : `Book for ${priceLabel(offering)}`;

  const bookingPanel = (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-3xl font-extrabold tracking-tight">{priceLabel(offering)}</p>
        <span className="text-xs font-semibold text-muted-foreground">
          {offering.durationMinutes} min · {formatLabel(offering)}
        </span>
      </div>

      {myBooking ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <p className="flex items-center gap-2 text-sm font-bold">
            <CircleCheck className="h-4 w-4" />
            You're booked
          </p>
          <p className="mt-1 text-sm">{formatSlot(myBooking.sessionDate, myBooking.startTime)}</p>
          <Link to="/my-sessions" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-900 px-4 text-xs font-bold text-white">
            <CalendarEvent className="h-3.5 w-3.5" />
            Manage in My Sessions
          </Link>
        </div>
      ) : selected ? (
        <>
          <div className="mt-4 rounded-2xl bg-secondary px-4 py-3">
            <p className="text-sm font-bold">{formatDateLong(selected.date)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatTimeRange(selected.startTime, selected.durationMinutes)} IST
            </p>
            {seats && <p className={`mt-1.5 text-xs font-bold ${seats.urgent ? "text-amber-700" : "text-muted-foreground"}`}>{seats.text}</p>}
          </div>
          <button type="button" onClick={onBook} className="clay-btn mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 px-4 text-sm font-bold">
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </>
      ) : (
        <p className="mt-4 rounded-2xl bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">No open times right now. Check back soon.</p>
      )}

      <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        <li className="flex gap-2">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          {offering.isFree ? "Cancel any time before it starts" : `Full refund if you cancel ${SESSION_FREE_CANCEL_HOURS}+ hours ahead`}
        </li>
        <li className="flex gap-2">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Meeting link shared before the session, plus a reminder email
        </li>
        {!isSignedIn && (
          <li className="flex gap-2">
            <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            You'll sign in first, then come straight back here
          </li>
        )}
      </ul>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Hero */}
          <section className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="relative">
              <SessionCover offering={offering} className="aspect-[16/9] w-full sm:aspect-[16/8]" />
              <div className="absolute left-4 top-4 flex gap-2">
                {offering.subject && <span className="rounded-full bg-background/95 px-3 py-1.5 text-xs font-bold text-primary">{offering.subject}</span>}
              </div>
              <FormatBadge offering={offering} className="absolute right-4 top-4 !px-3 !py-1.5 !text-xs" />
            </div>
            <div className="p-5 sm:p-7">
              <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-balance sm:text-4xl">{offering.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex items-center gap-2">
                  <MentorAvatar name={mentorBio.name} photoUrl={mentorBio.photoUrl} size={32} />
                  <span className="text-sm font-bold">{mentorBio.name}</span>
                </span>
                {mentorBio.yearOfStudy && <span className="text-sm text-muted-foreground">{mentorBio.yearOfStudy}</span>}
                {mentorBio.aiimsIitRank && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">{mentorBio.aiimsIitRank}</span>}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Fact label="Duration" value={`${offering.durationMinutes} minutes`} />
                <Fact label="Format" value={formatLabel(offering)} />
                <Fact label="Next open" value={nextLabel} />
                <Fact label="Repeats" value={describeSchedule(offering).replace(/ · .*$/, "")} />
              </div>

              {offering.description && (
                <div className="mt-6">
                  <h2 className="font-display text-lg font-bold">What you'll cover</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-foreground/75">{offering.description}</p>
                </div>
              )}
            </div>
          </section>

          {/* Pick a time */}
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
            <h2 className="font-display text-lg font-bold">Pick a time</h2>
            <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
              {offering.capacity > 1 && offering.capacity < 200 ? `Group session — up to ${offering.capacity} students per slot.` : "Choose a day, then a time that suits you."}
            </p>
            <SlotPicker slots={slots} selected={selected} onSelect={onSelect} showSeats />
          </section>

          {/* About the mentor */}
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              About {first}
            </h2>
            {mentorBio.aboutText && <p className="mt-3 whitespace-pre-line text-sm leading-7 text-foreground/75">{mentorBio.aboutText}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {mentorBio.enrolledCollege && <Chip label="College" value={mentorBio.enrolledCollege} />}
              {mentorBio.pursuedCourse && <Chip label="Course" value={mentorBio.pursuedCourse} />}
              {mentorBio.scoreType && mentorBio.scoreValue && (
                <Chip label={mentorBio.scoreType === "rank" ? "Rank" : mentorBio.scoreType === "percentile" ? "Percentile" : "Score"} value={mentorBio.scoreValue} />
              )}
            </div>
            {mentorBio.expertAt.length > 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-secondary p-4">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold">Strongest at {mentorBio.expertAt.join(", ")}</p>
                  {mentorBio.whyExpertAt && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mentorBio.whyExpertAt}</p>}
                </div>
              </div>
            )}
          </section>

          {/* More with this mentor */}
          {otherOfferings.length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
              <h2 className="font-display text-lg font-bold">More with {first}</h2>
              <ul className="mt-3 space-y-2">
                {otherOfferings.map((o) => (
                  <li key={o.id}>
                    <Link
                      to="/mentor-session/$offeringId"
                      params={{ offeringId: o.id }}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border px-4 py-2.5 transition-colors hover:border-foreground/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{o.title}</span>
                        <span className="block text-xs text-muted-foreground">{o.durationMinutes} min</span>
                      </span>
                      <span className="shrink-0 text-sm font-extrabold">{priceLabel(o)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Desktop sticky booking card */}
        <aside className="hidden lg:block">
          <div className="sticky top-6">{bookingPanel}</div>
        </aside>
      </div>

      {/* Mobile: booking card sits inline above the fold of the page end + a sticky action bar */}
      <div className="mt-6 lg:hidden">{bookingPanel}</div>
      {!myBooking && selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{priceLabel(offering)}</p>
              <p className="truncate text-xs text-muted-foreground">{formatSlot(selected.date, selected.startTime)}</p>
            </div>
            <button type="button" onClick={onBook} className="clay-btn inline-flex min-h-11 shrink-0 items-center gap-2 px-6 text-sm font-bold">
              {isSignedIn ? (offering.isFree ? "Book free" : "Book now") : "Sign in to book"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
      <span className="text-muted-foreground">{label}:</span> {value}
    </span>
  );
}
