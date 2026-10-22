import { createFileRoute, useNavigate, Link, notFound } from "@tanstack/react-router";
import { pageHead, noindexHead } from "@/lib/seo";
import { track } from "@/lib/analytics";
import { SESSIONS_HUB_PATH, buildSessionSeo } from "@/lib/session-seo";
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
  // Runs on the server for the first request. It hands the page its full
  // content (not just the <head>), so crawlers, link previews and slow
  // phones get the real session in the HTML instead of a loading spinner.
  loader: async ({ params }) => {
    try {
      const detail = await getMentorSessionOfferingDetail({ data: { offeringId: params.offeringId } });
      return { detail };
    } catch (err) {
      // A paused, deleted or made-up id is a genuine 404 — tell search
      // engines so they drop it, instead of serving a "noindex" page with a
      // 200. Anything else (a database blip) isn't the session's fault, so
      // fall back to the client-side load without claiming it's gone.
      const message = err instanceof Error ? err.message : "";
      if (/isn't available|no longer available|not found/i.test(message)) throw notFound();
      return { detail: null };
    }
  },
  head: ({ loaderData, params }) => {
    const detail = loaderData?.detail;
    if (!detail) return noindexHead("Session unavailable");
    const path = `/mentor-session/${params.offeringId}`;
    const seo = buildSessionSeo(detail as DetailData, path);
    return pageHead({ title: seo.title, description: seo.description, path, image: seo.image, jsonLd: seo.jsonLd });
  },
  notFoundComponent: SessionNotFound,
  component: MentorSessionDetailPage,
});

function SessionNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Link to="/" className="font-display text-base font-extrabold tracking-tight text-foreground">
          Edurack
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">This session isn't available</h1>
        <p className="mt-2 text-sm text-muted-foreground">The mentor may have paused or removed it. There are plenty of other sessions you can book.</p>
        <Link to={SESSIONS_HUB_PATH} className="clay-btn mt-6 inline-flex min-h-11 items-center px-6 text-sm">
          Browse mentorship sessions
        </Link>
      </main>
    </div>
  );
}

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
  // Seeded from the server-rendered loader data, so the first paint (and the
  // HTML crawlers see) already has the whole page. The client then refreshes
  // quietly in the background to pick up live seats and "you're booked".
  const initial = (Route.useLoaderData().detail ?? null) as DetailData | null;
  const [data, setData] = useState<DetailData | null>(initial);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(initial ? "ready" : "loading");
  const [selected, setSelected] = useState<OpenSlot | null>(initial?.slots[0] ?? null);
  const [booking, setBooking] = useState<OpenSlot | null>(null);

  async function load() {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const token = user ? await user.getIdToken() : undefined;
      const result = (await getMentorSessionOfferingDetail({ data: { token, offeringId } })) as DetailData;
      setData(result);
      setSelected((prev) => result.slots.find((s) => prev && s.date === prev.date && s.startTime === prev.startTime) ?? result.slots[0] ?? null);
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "error")); // keep showing what we have if only the refresh failed
    }
  }

  useEffect(() => {
    if (loading) return; // wait for auth to resolve once, so the first load already knows if there's a user
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, offeringId]);

  // One "viewed" event per session page, once its details are on screen.
  const viewedId = data?.offering.id;
  useEffect(() => {
    if (data) track("session_viewed", { offering_id: data.offering.id, is_free: data.offering.isFree, price: data.offering.isFree ? 0 : data.offering.price, open_slots: data.slots.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId]);

  function handleBook() {
    if (!selected || loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/mentor-session/${offeringId}` } as any });
      return;
    }
    setBooking(selected);
  }

  // Only block on auth when there's nothing to show yet. With server-rendered
  // data the page renders immediately; sign-in state fills in a moment later.
  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {user ? <AppHeader user={user} /> : <PublicHeader offeringId={offeringId} authLoading={loading} />}
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-4 sm:px-6 lg:pb-16">
        {user ? (
          <Link to="/dashboard" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        ) : (
          <nav aria-label="Breadcrumb" className="mb-4 flex min-h-11 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground hover:underline">
              Home
            </Link>
            <span>›</span>
            <Link to={SESSIONS_HUB_PATH} className="hover:text-foreground hover:underline">
              Mentorship sessions
            </Link>
            {data && (
              <>
                <span>›</span>
                <span className="max-w-[16rem] truncate font-semibold text-foreground">{data.offering.title}</span>
              </>
            )}
          </nav>
        )}

        {status === "loading" ? (
          <div className="space-y-4">
            <div className="aspect-[16/8] animate-pulse rounded-3xl bg-secondary" />
            <div className="h-40 animate-pulse rounded-3xl bg-secondary" />
          </div>
        ) : status === "error" || !data ? (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <p className="font-semibold">This session isn't available</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have been paused or removed by the mentor.</p>
            <Link to={user ? "/dashboard" : SESSIONS_HUB_PATH} className="clay-btn mt-5 inline-flex min-h-11 items-center px-6 text-sm">
              Browse other sessions
            </Link>
          </div>
        ) : (
          <SessionDetail data={data} selected={selected} onSelect={setSelected} onBook={handleBook} isSignedIn={Boolean(user)} authLoading={loading} />
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
function PublicHeader({ offeringId, authLoading = false }: { offeringId: string; authLoading?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <Link to="/" className="font-display text-base font-extrabold tracking-tight text-foreground">
        Edurack
      </Link>
      <Link
        to="/auth"
        search={{ redirect: `/mentor-session/${offeringId}` } as any}
        className={`clay-btn inline-flex min-h-10 items-center gap-1.5 px-5 text-sm ${authLoading ? "invisible" : ""}`}
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
  authLoading,
}: {
  data: DetailData;
  selected: OpenSlot | null;
  onSelect: (s: OpenSlot) => void;
  onBook: () => void;
  isSignedIn: boolean;
  authLoading: boolean;
}) {
  const { offering, mentorBio, otherOfferings, slots, myBooking } = data;
  const first = mentorBio.name.split(" ")[0];
  const seats = selected ? seatsNote(offering, selected) : null;
  const nextLabel = useMemo(() => (slots[0] ? formatSlot(slots[0].date, slots[0].startTime) : "None open"), [slots]);
  const ctaLabel = authLoading ? "Book this session" : !isSignedIn ? "Sign in to book" : offering.isFree ? "Book free session" : `Book for ${priceLabel(offering)}`;

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
              <SessionCover offering={offering} alt={`${offering.title} — mentorship session with ${mentorBio.name}`} priority className="aspect-[16/9] w-full sm:aspect-[16/8]" />
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
                  <Link to="/mentor-profile/$mentorId" params={{ mentorId: offering.mentorId }} className="text-sm font-bold hover:underline">
                    {mentorBio.name}
                  </Link>
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
            <Link to="/mentor-profile/$mentorId" params={{ mentorId: offering.mentorId }} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View {first}'s full profile
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
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

          {/* FAQ — plain <details>, so the answers are in the HTML for search engines and work without JS */}
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
            <h2 className="font-display text-lg font-bold">Common questions</h2>
            <div className="mt-3 divide-y divide-border">
              {faqFor(offering).map((f) => (
                <details key={f.q} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold">
                    {f.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
            <Link to={SESSIONS_HUB_PATH} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Browse all mentorship sessions
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>
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
              {isSignedIn || authLoading ? (offering.isFree ? "Book free" : "Book now") : "Sign in to book"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function faqFor(o: PublicMentorOffering): { q: string; a: string }[] {
  const kind = o.capacity <= 1 ? "a 1:1 session, just you and the mentor" : o.capacity >= 200 ? "an open session" : `a group session with up to ${o.capacity} students per slot`;
  return [
    { q: "How does this session work?", a: "Pick an open time, book it, and the mentor shares the meeting link before the session starts. You also get a reminder email. Sign-in is only needed at the booking step." },
    { q: "How long is it, and what format?", a: `It lasts ${o.durationMinutes} minutes and is ${kind}.` },
    { q: "When is the mentor available?", a: `${describeSchedule(o)}. All times are in Indian Standard Time (IST), and only the times shown above can be booked.` },
    { q: "What does it cost?", a: o.isFree ? "This session is free." : `This session costs ${priceLabel(o)} per student.` },
    {
      q: "Can I cancel?",
      a: o.isFree ? "Yes. You can cancel any time before it starts." : `Yes. You get a full refund if you cancel ${SESSION_FREE_CANCEL_HOURS} or more hours before it starts. If the mentor cancels, you are refunded.`,
    },
  ];
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
      <span className="text-muted-foreground">{label}:</span> {value}
    </span>
  );
}
