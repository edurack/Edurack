import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconClock as Clock,
  IconUsers as UsersIcon,
  IconArrowLeft as ArrowLeft,
  IconSchool as GraduationCap,
  IconTrophy as Trophy,
  IconCalendarTime as CalendarTime,
  IconSparkles as Sparkles,
  IconArrowRight as ArrowRight,
  IconLogin as LogIn,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { getMentorSessionOfferingDetail } from "@/server-functions/student-sessions";
import { BookingDialog } from "@/components/student-open-sessions-module";
import { AppHeader } from "@/components/app-header";
import type { MentorBioForOffering, OpenSlot, OtherOfferingSummary, PublicMentorOffering } from "@/lib/session-types";

export const Route = createFileRoute("/mentor-session/$offeringId")({
  component: MentorSessionDetailPage,
});

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const PINK_SOFT = "var(--pink-soft, #FCE7F3)";
const PINK_DEEP = "var(--pink-deep, #BE185D)";

type DetailData = {
  offering: PublicMentorOffering;
  mentorBio: MentorBioForOffering;
  slots: OpenSlot[];
  otherOfferings: OtherOfferingSummary[];
};

// This page is intentionally public — a logged-out visitor (from the
// landing page, or a shared link) can read the full offering, the
// mentor's bio, and every open slot without signing in. Only clicking
// "Book" is gated behind auth (see handleBookClick below), since booking
// itself needs a Firebase token (payments.ts).
//
// INTEGRATION NOTE: the redirect-back-after-login below sends the visitor
// to `/auth?redirect=/mentor-session/<id>`. This only actually returns
// them here if auth.tsx reads that `redirect` search param after a
// successful sign-in and navigates there — if your /auth route doesn't
// already support a redirect param, it'll just land them on your default
// post-login page, and they'll need to click into this session again.
// Wire that up: after firebaseSignIn/firebaseSignUp/googleAuth resolves,
// use the `redirect` search param instead of the current
// navigate({ to: "/dashboard" }) fallback when it's present.
function MentorSessionDetailPage() {
  const { offeringId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [booking, setBooking] = useState<OpenSlot | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = user ? await user.getIdToken() : undefined;
      const result = await getMentorSessionOfferingDetail({ data: { token, offeringId } });
      setData(result as DetailData);
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

  const dateGroups = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, OpenSlot[]>();
    for (const s of data.slots) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }
    return Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  useEffect(() => {
    if (dateGroups.length > 0 && !selectedDate) setSelectedDate(dateGroups[0][0]);
  }, [dateGroups, selectedDate]);

  function handleBookClick(slot: OpenSlot) {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/mentor-session/${offeringId}` } as any });
      return;
    }
    setBooking(slot);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {user ? <AppHeader user={user} /> : <PublicHeader offeringId={offeringId} />}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Link to={user ? "/dashboard" : "/"} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {user ? "Back to dashboard" : "Back to home"}
        </Link>

        {status === "loading" ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
          </div>
        ) : status === "error" || !data ? (
          <div className="clay p-10 text-center">
            <p className="text-sm text-foreground/60">This session isn't available — it may have been paused or removed.</p>
          </div>
        ) : (
          <SessionDetail
            data={data}
            dateGroups={dateGroups}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onPickSlot={handleBookClick}
            isSignedIn={Boolean(user)}
          />
        )}
      </main>

      {user && data && booking && (
        <BookingDialog
          offering={data.offering}
          slot={booking}
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

// Minimal fallback header for logged-out visitors — doesn't assume
// AppHeader gracefully handles a null user (it may require one). Swap
// this for whatever your actual public/marketing header component is if
// you already have one, rather than keeping this bare-bones version.
function PublicHeader({ offeringId }: { offeringId: string }) {
  return (
    <header className="clay-sm sticky top-0 z-20 mx-3 mt-3 flex items-center justify-between px-4 py-3 sm:mx-6">
      <Link to="/" className="font-display text-sm font-bold text-foreground">
        Edurack
      </Link>
      <Link
        to="/auth"
        search={{ redirect: `/mentor-session/${offeringId}` } as any}
        className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </Link>
    </header>
  );
}

function SessionDetail({
  data,
  dateGroups,
  selectedDate,
  onSelectDate,
  onPickSlot,
  isSignedIn,
}: {
  data: DetailData;
  dateGroups: [string, OpenSlot[]][];
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
  onPickSlot: (s: OpenSlot) => void;
  isSignedIn: boolean;
}) {
  const { offering, mentorBio, otherOfferings } = data;
  const isGroup = offering.capacity > 1;
  const slotsForSelectedDate = dateGroups.find(([d]) => d === selectedDate)?.[1] ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {/* Hero */}
        <div className="clay overflow-hidden">
          <div className="relative flex h-56 items-center justify-center sm:h-72" style={{ background: `linear-gradient(135deg, ${PINK_SOFT}, var(--sky-soft))` }}>
            {offering.thumbnailUrl ? (
              <img src={offering.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Sparkles className="h-14 w-14 opacity-40" style={{ color: PINK_DEEP }} strokeWidth={1.5} />
            )}
            {offering.subject && (
              <span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1.5 text-xs font-bold text-foreground/80 shadow-sm">
                {offering.subject}
              </span>
            )}
            {isGroup && (
              <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-background/90 px-3 py-1.5 text-xs font-bold text-foreground/80 shadow-sm">
                <UsersIcon className="h-3.5 w-3.5" />
                Group session
              </span>
            )}
          </div>
          <div className="p-5 sm:p-6">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{offering.title}</h1>
            <div className="mt-2 flex items-center gap-2">
              {mentorBio.photoUrl ? (
                <img src={mentorBio.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={{ background: PINK_SOFT, color: PINK_DEEP }}>
                  {mentorBio.name.charAt(0)}
                </div>
              )}
              <span className="text-sm font-semibold text-foreground/70">{mentorBio.name}</span>
              {mentorBio.yearOfStudy && <span className="text-xs text-foreground/40">· {mentorBio.yearOfStudy}</span>}
            </div>
            {offering.description && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-foreground/70">{offering.description}</p>}
          </div>
        </div>

        {/* About the mentor */}
        <div className="clay p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <GraduationCap className="h-5 w-5 text-foreground/40" />
            About {mentorBio.name.split(" ")[0]}
          </h2>
          {mentorBio.aboutText && <p className="mb-4 whitespace-pre-line text-sm leading-6 text-foreground/70">{mentorBio.aboutText}</p>}
          <div className="flex flex-wrap gap-2">
            {mentorBio.aiimsIitRank && <InfoChip label="Rank" value={mentorBio.aiimsIitRank} />}
            {mentorBio.enrolledCollege && <InfoChip label="College" value={mentorBio.enrolledCollege} />}
            {mentorBio.pursuedCourse && <InfoChip label="Course" value={mentorBio.pursuedCourse} />}
          </div>
          {mentorBio.expertAt.length > 0 && (
            <div className="clay-inset mt-4 flex items-start gap-3 rounded-2xl p-4">
              <Trophy className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PINK_DEEP }} />
              <div>
                <p className="text-sm font-bold text-foreground">Expert at {mentorBio.expertAt.join(", ")}</p>
                {mentorBio.whyExpertAt && <p className="mt-1 text-xs text-foreground/60">{mentorBio.whyExpertAt}</p>}
                {mentorBio.scoreType && mentorBio.scoreValue && (
                  <p className="mt-1 text-xs font-semibold text-foreground/50">
                    {mentorBio.scoreType === "rank" ? "Rank" : mentorBio.scoreType === "percentile" ? "Percentile" : "Score"}: {mentorBio.scoreValue}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Full slot calendar */}
        <div className="clay p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <CalendarTime className="h-5 w-5 text-foreground/40" />
            Choose a time
          </h2>
          {!isSignedIn && (
            <p className="mb-4 rounded-2xl bg-[var(--sky-soft)] px-4 py-2.5 text-xs font-semibold text-foreground/70">
              Sign in to book — picking a time below will take you to a quick sign-in first.
            </p>
          )}
          {dateGroups.length === 0 ? (
            <p className="text-sm text-foreground/60">No open slots right now — check back soon.</p>
          ) : (
            <>
              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {dateGroups.map(([d]) => {
                  const active = d === selectedDate;
                  const date = new Date(d);
                  return (
                    <button
                      key={d}
                      onClick={() => onSelectDate(d)}
                      className={`flex shrink-0 flex-col items-center rounded-2xl px-3.5 py-2 text-xs font-bold transition-all ${
                        active ? "clay-btn text-white" : "clay-chip text-foreground/70"
                      }`}
                      style={active ? { background: PINK_DEEP } : undefined}
                    >
                      <span>{date.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                      <span className="text-[10px] font-normal opacity-80">{date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {slotsForSelectedDate.map((s) => (
                  <button
                    key={s.startTime}
                    onClick={() => onPickSlot(s)}
                    className="clay-chip flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-foreground/5"
                  >
                    <Clock className="h-3.5 w-3.5 text-foreground/40" />
                    {s.startTime}
                    {isGroup && <span className="text-[11px] font-normal text-foreground/40">· {s.seatsRemaining} left</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* More with this mentor */}
        {otherOfferings.length > 0 && (
          <div className="clay p-5 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-bold text-foreground">More sessions with {mentorBio.name.split(" ")[0]}</h2>
            <div className="space-y-2">
              {otherOfferings.map((o) => (
                <Link
                  key={o.id}
                  to="/mentor-session/$offeringId"
                  params={{ offeringId: o.id }}
                  className="clay-inset flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-foreground/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{o.title}</p>
                    <p className="text-xs text-foreground/50">{o.durationMinutes} min</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-foreground/70">{o.isFree ? "Free" : currency.format(o.price)}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-foreground/30" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky pricing / booking sidebar */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="clay p-5">
          <p className="font-display text-2xl font-bold text-foreground">{offering.isFree ? "Free" : currency.format(offering.price)}</p>
          <p className="mt-1 text-xs text-foreground/50">{offering.durationMinutes} min · {isGroup ? `up to ${offering.capacity} students` : "1:1 with mentor"}</p>

          {dateGroups.length > 0 ? (
            <button
              onClick={() => onPickSlot(dateGroups.find(([d]) => d === selectedDate)?.[1][0] ?? dateGroups[0][1][0])}
              className="clay-btn mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-bold text-white transition-transform"
              style={{ background: PINK_DEEP }}
            >
              {offering.isFree ? "Book free session" : "Book now"}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <p className="mt-4 rounded-2xl bg-foreground/5 px-4 py-3 text-center text-xs text-foreground/50">No open slots right now</p>
          )}

          <p className="mt-3 text-center text-[11px] text-foreground/40">
            {isSignedIn ? "Pick your exact time above — this books the first open slot for a quick start." : "You'll sign in first, then land right back here to finish booking."}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="clay-chip rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/70">
      <span className="text-foreground/40">{label}:</span> {value}
    </span>
  );
}