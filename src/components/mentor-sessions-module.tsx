import { useEffect, useMemo, useState } from "react";
import {
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconCalendarTime as CalendarTime,
  IconUsers as Users,
  IconLink as LinkIcon,
  IconX as X,
  IconHelpCircle as HelpCircle,
  IconClock as Clock,
} from "@tabler/icons-react";
import {
  listMyOfferings,
  createOffering,
  setOfferingActive,
  deleteOffering,
  listMyBookings,
  setMeetingLinkForSession,
} from "@/server-functions/mentor-sessions";
import { getMentorProfile } from "@/server-functions/mentor-auth";
import {
  DAY_LABELS,
  DURATION_OPTIONS,
  MAX_SESSION_CAPACITY,
  UNLIMITED_CAPACITY,
  isUnlimitedOffering,
  describeSchedule,
  groupBookingsIntoRosters,
  type DayOfWeek,
  type SessionFormat,
  type MentorSessionOffering,
  type MentorSessionBooking,
  type SessionRoster,
} from "@/lib/session-types";
import { ImageUploadField } from "@/components/mentor-portal-ui";
import { useTour, OnboardingTour, type TourStep } from "@/components/shared/onboarding-tour";

const SESSIONS_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="sessions-tabs"]',
    title: "Offerings vs. bookings",
    description:
      "\"My offerings\" is where you publish open slots — 1:1 or group — for students to book. \"Sessions & students\" shows who actually booked, grouped into rosters.",
  },
  {
    selector: '[data-tour="sessions-content"]',
    title: "Manage what's here",
    description:
      "Toggle an offering active/inactive or delete it, or — on the bookings tab — set the meeting link for an upcoming session.",
  },
];

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function MentorSessionsModule({ mentorToken }: { mentorToken: string }) {
  const [tab, setTab] = useState<"offerings" | "bookings">("offerings");
  const [offerings, setOfferings] = useState<MentorSessionOffering[] | null>(null);
  const [bookings, setBookings] = useState<MentorSessionBooking[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadOfferings() {
    const { offerings: rows } = await listMyOfferings({ data: { token: mentorToken } });
    setOfferings(rows as MentorSessionOffering[]);
  }
  async function loadBookings() {
    const { bookings: rows } = await listMyBookings({ data: { token: mentorToken } });
    setBookings(rows as MentorSessionBooking[]);
  }

  useEffect(() => {
    loadOfferings();
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capacity per offering, so the roster view can show "6 of 10 seats" —
  // listMyBookings doesn't carry capacity itself (it's a flat booking
  // list), so this looks it up from the offerings already loaded above.
  const capacityByOffering = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offerings ?? []) m.set(o.id, o.capacity);
    return m;
  }, [offerings]);

  const rosters = useMemo(() => {
    if (!bookings) return null;
    const grouped = groupBookingsIntoRosters(bookings);
    return grouped.map((r) => ({ ...r, capacity: capacityByOffering.get(r.offeringId) ?? r.students.length }));
  }, [bookings, capacityByOffering]);

  const studentCount = bookings?.length ?? 0;
  const tour = useTour("mentorTourSessionsSeen");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Sessions</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Publish open time — 1:1, a limited group, or open to everyone — for students to book. Each student can hold one active
            booking per offering, and nothing repeats unless you choose a weekly option.
          </p>
        </div>
        <button
          type="button"
          onClick={tour.start}
          className="clay-btn-ghost flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold text-foreground/60"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Help
        </button>
      </div>

      <div data-tour="sessions-tabs" className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("offerings")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${tab === "offerings" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
          >
            My offerings {offerings ? `(${offerings.length})` : ""}
          </button>
          <button
            onClick={() => setTab("bookings")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${tab === "bookings" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
          >
            Sessions & students {rosters ? `(${rosters.length} · ${studentCount} students)` : ""}
          </button>
        </div>
        {tab === "offerings" && (
          <button
            onClick={() => setShowCreate(true)}
            className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold transition-transform"
          >
            <Plus className="h-4 w-4" />
            New session offering
          </button>
        )}
      </div>

      {tab === "offerings" ? (
        <div data-tour="sessions-content">
        <OfferingsList
          offerings={offerings}
          onToggleActive={async (id, active) => {
            await setOfferingActive({ data: { token: mentorToken, offeringId: id, active } });
            loadOfferings();
          }}
          onDelete={async (id) => {
            if (!confirm("Delete this offering? Existing bookings are kept, but no new ones can be made against it.")) return;
            await deleteOffering({ data: { token: mentorToken, offeringId: id } });
            loadOfferings();
          }}
        />
        </div>
      ) : (
        <div data-tour="sessions-content">
        <RosterList
          rosters={rosters}
          onSetLink={async (offeringId, sessionDate, startTime, link) => {
            await setMeetingLinkForSession({ data: { token: mentorToken, offeringId, sessionDate, startTime, meetingLink: link } });
            loadBookings();
          }}
        />
        </div>
      )}

      {showCreate && (
        <CreateOfferingDialog
          mentorToken={mentorToken}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadOfferings();
          }}
        />
      )}

      {tour.active && <OnboardingTour steps={SESSIONS_TOUR_STEPS} onFinish={tour.finish} />}
    </div>
  );
}

function OfferingsList({
  offerings,
  onToggleActive,
  onDelete,
}: {
  offerings: MentorSessionOffering[] | null;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (offerings === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (offerings.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No session offerings yet — create your first one.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {offerings.map((o) => (
        <div key={o.id} className="clay flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-foreground">{o.title}</p>
              <p className="text-xs text-foreground/50">
                {o.durationMinutes} min · {o.isFree ? "Free" : currency.format(o.price)}
                {isUnlimitedOffering(o) ? " · open to everyone" : o.capacity > 1 ? ` · up to ${o.capacity} students` : " · 1:1"}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${o.active ? "bg-[var(--mint-soft)] text-foreground" : "bg-foreground/10 text-foreground/50"}`}>
              {o.active ? "Live" : "Paused"}
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70">
            <Clock className="h-3.5 w-3.5 text-foreground/30" />
            {describeSchedule(o)}
          </p>
          {o.subject && <p className="text-[11px] font-semibold text-[var(--sky-deep)]">Subject: {o.subject}</p>}
          {!o.isOngoing && o.dateRangeEnd && (
            <p className="text-[11px] text-foreground/40">Ends {new Date(o.dateRangeEnd).toLocaleDateString("en-IN")}</p>
          )}
          <div className="mt-2 flex gap-2">
            <button onClick={() => onToggleActive(o.id, !o.active)} className="clay-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold">
              {o.active ? "Pause" : "Resume"}
            </button>
            <button
              onClick={() => onDelete(o.id)}
              className="clay-btn-ghost inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Groups bookings into one card per session instance — for a 1:1 offering
// that's one student; for a group offering it's the whole roster, with one
// shared meeting-link field for everyone in that session.
function RosterList({
  rosters,
  onSetLink,
}: {
  rosters: (SessionRoster & { capacity: number })[] | null;
  onSetLink: (offeringId: string, sessionDate: string, startTime: string, link: string) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (rosters === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (rosters.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No bookings yet.</div>;
  }

  return (
    <div className="space-y-3">
      {rosters.map((r) => {
        const key = `${r.offeringId}:${r.sessionDate}:${r.startTime}`;
        const existingLink = r.students.find((s) => s.meetingLink)?.meetingLink ?? null;
        const unlimited = r.capacity >= UNLIMITED_CAPACITY;
        const isGroup = r.capacity > 1 && !unlimited;
        return (
          <div key={key} className="clay p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 font-display text-base font-bold text-foreground">
                  <Users className="h-4 w-4 text-foreground/40" />
                  {r.offeringTitle}
                  {isGroup && (
                    <span className="rounded-full bg-[var(--purple-soft,#EDE9FE)] px-2 py-0.5 text-[10px] font-bold text-[var(--purple-deep,#6D28D9)]">
                      {r.students.length}/{r.capacity} seats
                    </span>
                  )}
                  {unlimited && (
                    <span className="rounded-full bg-[var(--purple-soft,#EDE9FE)] px-2 py-0.5 text-[10px] font-bold text-[var(--purple-deep,#6D28D9)]">
                      {r.students.length} joined · open to everyone
                    </span>
                  )}
                </p>
                <p className="text-xs text-foreground/50">
                  {new Date(r.sessionDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} · {r.startTime} ·{" "}
                  {r.durationMinutes} min
                </p>
              </div>

              {editingKey === key ? (
                <div className="flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Meeting link"
                    className="clay-inset rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      onSetLink(r.offeringId, r.sessionDate, r.startTime, draft);
                      setEditingKey(null);
                    }}
                    className="clay-btn rounded-full px-3 py-1.5 text-xs font-semibold"
                  >
                    Save
                  </button>
                </div>
              ) : existingLink ? (
                <a href={existingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)] hover:underline">
                  <LinkIcon className="h-3.5 w-3.5" />
                  Meeting link
                </a>
              ) : (
                <button
                  onClick={() => {
                    setEditingKey(key);
                    setDraft("");
                  }}
                  className="clay-btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  Add meeting link
                </button>
              )}
            </div>

            <ul className="space-y-1.5">
              {r.students.map((s) => (
                <li key={s.id} className="clay-inset flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{s.studentName}</p>
                    {s.studentNote && <p className="truncate text-xs italic text-foreground/50">"{s.studentNote}"</p>}
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${s.paymentStatus === "paid" || s.paymentStatus === "free" ? "text-[var(--sky-deep)]" : "text-foreground/50"}`}>
                    {s.isFree ? "Free" : currency.format(s.price)} · {s.paymentStatus}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function CreateOfferingDialog({
  mentorToken,
  onClose,
  onCreated,
}: {
  mentorToken: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<(typeof DURATION_OPTIONS)[number]>(30);
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("");
  // Nothing recurs until the mentor explicitly says so — "once" is the
  // default so publishing a session never silently turns into a standing
  // weekly commitment.
  const [repeatMode, setRepeatMode] = useState<"once" | "weekly_ongoing" | "weekly_until">("once");
  const [onceDate, setOnceDate] = useState("");
  const [days, setDays] = useState<Set<DayOfWeek>>(new Set());
  const [times, setTimes] = useState<string[]>(["17:00"]);
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState<SessionFormat>("one_on_one");
  const [groupCapacity, setGroupCapacity] = useState("10");
  const [subject, setSubject] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [mentorPhotoUrl, setMentorPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the thumbnail to the mentor's own profile photo — pulled
  // straight from their profile, not something they have to re-upload —
  // so the form starts pre-filled. They can still replace or remove it.
  useEffect(() => {
    getMentorProfile({ data: { token: mentorToken } }).then(({ profile }) => {
      setMentorPhotoUrl(profile.profilePictureUrl);
      setThumbnailUrl((prev) => prev || (profile.profilePictureUrl ?? ""));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Open to everyone" is always free — there's no price field for it, so
  // force isFree true whenever that format is selected.
  useEffect(() => {
    if (format === "open_unlimited") setIsFree(true);
  }, [format]);

  function toggleDay(d: DayOfWeek) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    if (repeatMode === "once" && !onceDate) return setError("Pick a date.");
    if (repeatMode === "weekly_until" && !endDate) return setError("Pick an end date, or choose \"Weekly, ongoing\".");
    if (repeatMode !== "once" && days.size === 0) return setError("Pick at least one day.");
    setSubmitting(true);
    try {
      const cap =
        format === "one_on_one"
          ? 1
          : format === "open_unlimited"
            ? UNLIMITED_CAPACITY
            : Math.max(2, Math.min(MAX_SESSION_CAPACITY, Number(groupCapacity) || 2));

      // "Once" is stored as an ordinary weekly-pattern offering whose date
      // range is pinned to just that one day, so it produces exactly one
      // occurrence and then never appears again — no schema special-case
      // needed, and it can never silently turn into a standing weekly slot.
      const recurringDays = repeatMode === "once" ? [new Date(onceDate).getDay() as DayOfWeek] : Array.from(days);
      const dateRangeStart = repeatMode === "once" ? onceDate : null;
      const dateRangeEnd = repeatMode === "once" ? onceDate : repeatMode === "weekly_until" ? endDate || null : null;
      const isOngoing = repeatMode === "weekly_ongoing";

      await createOffering({
        data: {
          token: mentorToken,
          title,
          description,
          durationMinutes: duration,
          isFree: format === "open_unlimited" ? true : isFree,
          price: format === "open_unlimited" ? 0 : Number(price) || 0,
          thumbnailUrl: thumbnailUrl.trim() || null,
          recurringDays,
          startTimes: times.filter(Boolean),
          dateRangeStart,
          dateRangeEnd,
          isOngoing,
          capacity: cap,
          subject: subject.trim() || null,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this offering.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="clay max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground">New session offering</h3>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3.5">
          <Field label="Title / topic">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Doubt clearing — Organic Chemistry" className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
          </Field>

          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
          </Field>

          <Field label="Subject (optional — powers student recommendations, e.g. after a low test score in this subject)">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Maths, Physics, Organic Chemistry" className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none" />
          </Field>

          <Field label="Duration">
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((d) => (
                <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${duration === d ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}>
                  {d} min
                </button>
              ))}
            </div>
          </Field>

          <Field label="Who can join?">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setFormat("one_on_one")}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${format === "one_on_one" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
              >
                One student
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">1:1 — you and them only</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat("limited_group")}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${format === "limited_group" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
              >
                A limited group
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">You set the max students</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat("open_unlimited")}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${format === "open_unlimited" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
              >
                Anyone, no limit
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">Open to everyone, always free</span>
              </button>
            </div>
            {format === "limited_group" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-foreground/60">Max students per slot</span>
                <input
                  value={groupCapacity}
                  onChange={(e) => setGroupCapacity(e.target.value)}
                  inputMode="numeric"
                  className="clay-inset w-20 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                />
              </div>
            )}
          </Field>

          {format !== "open_unlimited" && (
            <Field label="Price">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-foreground/70">
                  <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
                  Free
                </label>
                {!isFree && (
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="numeric"
                    placeholder={format === "limited_group" ? "₹ per student" : "₹ amount"}
                    className="clay-inset flex-1 rounded-2xl px-4 py-2 text-sm focus:outline-none"
                  />
                )}
              </div>
              {!isFree && price && <p className="mt-1 text-[11px] text-foreground/40">You'll receive {currency.format(Math.round(Number(price) * 0.95))} per student after platform commission (5%).</p>}
            </Field>
          )}

          <Field label="How often does this run?">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setRepeatMode("once")}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${repeatMode === "once" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
              >
                Just once
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">A single date — doesn't repeat</span>
              </button>
              <button
                type="button"
                onClick={() => setRepeatMode("weekly_until")}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${repeatMode === "weekly_until" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
              >
                Weekly, until a date
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">Repeats every week, then stops</span>
              </button>
              <button
                type="button"
                onClick={() => setRepeatMode("weekly_ongoing")}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${repeatMode === "weekly_ongoing" ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
              >
                Weekly, ongoing
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">Repeats every week until you pause it</span>
              </button>
            </div>
          </Field>

          {repeatMode === "once" ? (
            <Field label="Date">
              <input
                type="date"
                value={onceDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setOnceDate(e.target.value)}
                className="clay-inset w-full rounded-2xl px-4 py-2 text-sm focus:outline-none"
              />
            </Field>
          ) : (
            <Field label="Which days does this repeat on?">
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS.map((label, i) => (
                  <button key={label} type="button" onClick={() => toggleDay(i as DayOfWeek)} className={`rounded-xl py-1.5 text-xs font-semibold ${days.has(i as DayOfWeek) ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {repeatMode === "weekly_until" && (
            <Field label="Repeat until">
              <input
                type="date"
                value={endDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEndDate(e.target.value)}
                className="clay-inset w-full rounded-2xl px-4 py-2 text-sm focus:outline-none"
              />
            </Field>
          )}

          <Field label={repeatMode === "once" ? "What time(s) on that day?" : "What time(s) — same times apply to every day you picked above"}>
            <div className="space-y-1.5">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => setTimes((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                    className="clay-inset rounded-2xl px-4 py-2 text-sm focus:outline-none"
                  />
                  {times.length > 1 && (
                    <button onClick={() => setTimes((prev) => prev.filter((_, idx) => idx !== i))} className="text-foreground/40 hover:text-foreground/70">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setTimes((prev) => [...prev, "17:00"])} className="clay-btn-ghost inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                Add another time
              </button>
              {repeatMode !== "once" && (
                <p className="text-[11px] text-foreground/40">
                  Need different times on different days? Publish this as a separate offering for those days instead.
                </p>
              )}
            </div>
          </Field>

          <ImageUploadField
            label="Thumbnail (optional)"
            value={thumbnailUrl}
            onChange={setThumbnailUrl}
            storagePath={`mentor-sessions/${mentorToken.split(".")[0]}/thumbnails`}
          />
          <p className="-mt-2 text-[11px] text-foreground/40">
            {thumbnailUrl && thumbnailUrl === mentorPhotoUrl
              ? "Using your profile photo by default — upload a different image to change it."
              : thumbnailUrl
                ? "Custom thumbnail set — remove it to fall back to your profile photo."
                : mentorPhotoUrl
                  ? "Removed — we'll show your profile photo instead."
                  : "No profile photo on file yet — we'll show a placeholder until you upload one here or on your profile."}
          </p>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !title.trim() ||
              (repeatMode === "once" ? !onceDate : days.size === 0) ||
              (repeatMode === "weekly_until" && !endDate)
            }
            className="clay-btn mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition-transform disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarTime className="h-4 w-4" />}
            Publish offering
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">{label}</p>
      {children}
    </div>
  );
}