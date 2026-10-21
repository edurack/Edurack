// Create / edit a session offering.
//
// Replaces a single 14-field scrolling form (with a Publish button that sat
// greyed-out and never said why) with three short steps and a live preview of
// the card students will actually see. Anything a mentor could get wrong is
// caught as they type — a schedule that overlaps another session, a date that
// has passed, a price that doesn't parse — and the same rules are enforced on
// the server (see normalizeOfferingInput in server-functions/mentor-sessions.ts).
import { useEffect, useMemo, useState } from "react";
import {
  IconX as X,
  IconPlus as Plus,
  IconMinus as Minus,
  IconUser as User,
  IconUsers as Users,
  IconGift as Gift,
  IconCheck as Check,
  IconAlertTriangle as AlertTriangle,
  IconLoader2 as Loader2,
  IconArrowRight as ArrowRight,
  IconArrowLeft as ArrowLeft,
  IconCalendarTime as CalendarTime,
} from "@tabler/icons-react";
import { createOffering, updateOffering } from "@/server-functions/mentor-sessions";
import { getMentorProfile } from "@/server-functions/mentor-auth";
import {
  DAY_LABELS,
  DURATION_OPTIONS,
  MAX_SESSION_CAPACITY,
  UNLIMITED_CAPACITY,
  formatForOffering,
  splitSessionPrice,
  SESSION_PLATFORM_COMMISSION_PERCENT,
  allWindowStartTimes,
  findWindowProblem,
  hhmmToMinutes,
  minutesToHhmm,
  windowDaysUnion,
  windowStartTimes,
  type DayOfWeek,
  type DayWindow,
  type MentorSessionOffering,
  type PublicMentorOffering,
  type SessionFormat,
} from "@/lib/session-types";
import { findScheduleConflicts, previewSlots, type ScheduleDraft } from "@/lib/session-schedule";
import { formatDateLong, formatTime12, istDateString, relativeDay } from "@/lib/session-time";
import { SessionArtworkField, inputClass, textareaClass } from "@/components/mentor-portal-ui";
import { FormatBadge, MentorAvatar, SessionCover, formatLabel, inr, priceLabel } from "@/components/sessions/session-ui";

type RepeatMode = "once" | "weekly_until" | "weekly_ongoing";
type FieldErrors = Partial<Record<"title" | "price" | "capacity" | "date" | "endDate" | "times" | "schedule", string>>;

const STEPS = ["Basics", "Format & price", "Schedule"] as const;
const SUBJECT_SUGGESTIONS = ["Physics", "Chemistry", "Biology", "Maths", "Strategy", "Admissions"];
const PRICE_PRESETS = [199, 299, 499, 999];
const DAY_ORDER: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const MAX_WINDOWS = 10;
const DAY_PRESETS: { label: string; days: DayOfWeek[] }[] = [
  { label: "Mon–Fri", days: [1, 2, 3, 4, 5] },
  { label: "Sat–Sun", days: [6, 0] },
  { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
];

// One editable availability row: a group of days sharing a from–to range.
type WindowRow = { key: number; days: DayOfWeek[]; start: string; end: string };
let windowKeySeq = 0;
const newKey = () => ++windowKeySeq;
const sameDays = (a: DayOfWeek[], b: DayOfWeek[]) => a.length === b.length && a.every((d) => b.includes(d));

const FORMATS: { key: SessionFormat; icon: typeof User; title: string; desc: string }[] = [
  { key: "one_on_one", icon: User, title: "One student", desc: "A private 1:1 with you" },
  { key: "limited_group", icon: Users, title: "Small group", desc: "You set the maximum" },
  { key: "open_unlimited", icon: Gift, title: "Open to everyone", desc: "No limit. Always free" },
];

const REPEATS: { key: RepeatMode; title: string; desc: string }[] = [
  { key: "once", title: "Just once", desc: "A single date" },
  { key: "weekly_until", title: "Weekly until…", desc: "Repeats, then stops" },
  { key: "weekly_ongoing", title: "Weekly, ongoing", desc: "Until you pause it" },
];

const choiceCard = (selected: boolean) =>
  `flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-colors ${
    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-foreground/30"
  }`;

const chipBtn = (selected: boolean) =>
  `min-h-9 rounded-full border px-3.5 text-xs font-bold transition-colors ${
    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground/70 hover:border-foreground/30"
  }`;

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() as DayOfWeek;

export function MentorOfferingDialog({
  mentorToken,
  editing = null,
  existing,
  onClose,
  onCreated,
}: {
  mentorToken: string;
  editing?: MentorSessionOffering | null;
  /** Every offering this mentor has, used to warn about overlapping times. */
  existing: MentorSessionOffering[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = istDateString();

  const isEditedOneTime = !!editing && !editing.isOngoing && !!editing.dateRangeStart && editing.dateRangeStart === editing.dateRangeEnd;

  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Basics
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(editing?.thumbnailUrl ?? "");
  const [posterUrl, setPosterUrl] = useState(editing?.posterUrl ?? "");
  const [mentorName, setMentorName] = useState("You");
  const [mentorPhotoUrl, setMentorPhotoUrl] = useState<string | null>(null);

  // Format & price
  const [format, setFormat] = useState<SessionFormat>(editing ? formatForOffering(editing) : "one_on_one");
  const [groupCapacity, setGroupCapacity] = useState(editing && editing.capacity > 1 && editing.capacity < UNLIMITED_CAPACITY ? editing.capacity : 10);
  const [duration, setDuration] = useState<(typeof DURATION_OPTIONS)[number]>(editing?.durationMinutes ?? 30);
  const [isFree, setIsFree] = useState(editing?.isFree ?? false);
  const [price, setPrice] = useState(editing && !editing.isFree ? String(editing.price) : "");

  // Schedule — nothing recurs until the mentor says so, so publishing a
  // session never silently becomes a standing weekly commitment.
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(!editing ? "once" : editing.isOngoing ? "weekly_ongoing" : isEditedOneTime ? "once" : "weekly_until");
  const [onceDate, setOnceDate] = useState(isEditedOneTime ? (editing!.dateRangeStart as string).slice(0, 10) : "");
  const [endDate, setEndDate] = useState(editing && !editing.isOngoing && !isEditedOneTime ? (editing.dateRangeEnd ?? "").slice(0, 10) : "");
  // Availability: each row is a group of days + a from–to range. Students can
  // only book sessions that fit completely inside a range. Offerings saved
  // before ranges existed (fixed start times) open as one range per start time,
  // which produces exactly the same slots.
  const [windows, setWindows] = useState<WindowRow[]>(() => {
    if (editing?.dayWindows?.length) return editing.dayWindows.map((w) => ({ key: newKey(), days: [...w.days], start: w.start, end: w.end }));
    if (editing?.startTimes?.length) {
      return editing.startTimes.map((t) => ({
        key: newKey(),
        days: [...editing.recurringDays],
        start: t.slice(0, 5),
        end: minutesToHhmm(Math.min(hhmmToMinutes(t) + editing.durationMinutes, 23 * 60 + 59)),
      }));
    }
    return [{ key: newKey(), days: [], start: "18:00", end: "19:00" }];
  });

  // Default the thumbnail to the mentor's profile photo (new offerings only —
  // when editing, an empty thumbnail is a deliberate choice).
  useEffect(() => {
    getMentorProfile({ data: { token: mentorToken } })
      .then(({ profile }) => {
        setMentorName(profile.name);
        setMentorPhotoUrl(profile.profilePictureUrl);
        if (!editing) setThumbnailUrl((prev) => prev || (profile.profilePictureUrl ?? ""));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (format === "open_unlimited") setIsFree(true);
  }, [format]);

  const initialSnapshot = useMemo(() => JSON.stringify({ title, description, subject, thumbnailUrl, posterUrl, format, groupCapacity, duration, isFree, price, repeatMode, onceDate, endDate, windows: windows.map(({ days, start, end }) => ({ days: [...days].sort(), start, end })) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = JSON.stringify({ title, description, subject, thumbnailUrl, posterUrl, format, groupCapacity, duration, isFree, price, repeatMode, onceDate, endDate, windows: windows.map(({ days, start, end }) => ({ days: [...days].sort(), start, end })) });
  const dirty = snapshot !== initialSnapshot;

  function requestClose() {
    if (submitting) return;
    if (dirty && !confirm("Discard your changes?")) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, submitting]);

  const capacity = format === "one_on_one" ? 1 : format === "open_unlimited" ? UNLIMITED_CAPACITY : Math.max(2, Math.min(MAX_SESSION_CAPACITY, groupCapacity));
  const free = format === "open_unlimited" ? true : isFree;
  const priceNum = Number(price);
  // The ranges as they'll be saved. A one-off session has a single date, so
  // every range simply applies to that date's weekday.
  const effectiveWindows = useMemo<DayWindow[]>(
    () => windows.map((w) => ({ days: repeatMode === "once" ? (onceDate ? [weekdayOf(onceDate)] : []) : [...w.days].sort((a, b) => a - b) as DayOfWeek[], start: w.start, end: w.end })),
    [windows, repeatMode, onceDate],
  );
  const cleanTimes = useMemo(() => allWindowStartTimes(effectiveWindows.filter((w) => /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end)), duration), [effectiveWindows, duration]);

  // What the schedule means as concrete dates, for preview + overlap checks.
  const draft = useMemo<ScheduleDraft>(() => {
    const base = { id: editing?.id, title: title || "This session", startTimes: cleanTimes, dayWindows: effectiveWindows, durationMinutes: duration };
    if (repeatMode === "once") {
      return { ...base, recurringDays: onceDate ? [weekdayOf(onceDate)] : [], dateRangeStart: onceDate || null, dateRangeEnd: onceDate || null, isOngoing: false };
    }
    return {
      ...base,
      recurringDays: windowDaysUnion(effectiveWindows),
      dateRangeStart: null,
      dateRangeEnd: repeatMode === "weekly_until" ? endDate || null : null,
      // Until an end date is chosen, preview it as open-ended rather than empty.
      isOngoing: repeatMode === "weekly_ongoing" || !endDate,
    };
  }, [repeatMode, onceDate, endDate, effectiveWindows, cleanTimes, duration, title, editing?.id]);

  const upcomingSlots = useMemo(() => previewSlots(draft, { windowDays: 366 }), [draft]);
  const conflicts = useMemo(() => {
    const others: ScheduleDraft[] = existing
      .filter((o) => o.active && o.id !== editing?.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        recurringDays: o.recurringDays,
        startTimes: o.startTimes,
        dayWindows: o.dayWindows,
        dateRangeStart: o.dateRangeStart,
        dateRangeEnd: o.dateRangeEnd,
        isOngoing: o.isOngoing,
        durationMinutes: o.durationMinutes,
      }));
    return findScheduleConflicts(draft, others);
  }, [draft, existing, editing?.id]);

  // Validation mirrors the server so problems show up as you type.
  const errors = useMemo<FieldErrors>(() => {
    const e: FieldErrors = {};
    const t = title.replace(/\s+/g, " ").trim();
    if (t.length < 3) e.title = "Give this session a clear title (at least 3 characters).";
    if (!free && (!Number.isInteger(priceNum) || priceNum < 1 || priceNum > 50_000)) e.price = "Enter a whole-rupee price between ₹1 and ₹50,000, or switch to Free.";
    if (format === "limited_group" && (groupCapacity < 2 || groupCapacity > MAX_SESSION_CAPACITY)) e.capacity = `Choose between 2 and ${MAX_SESSION_CAPACITY} students.`;
    if (repeatMode === "once") {
      if (!onceDate) e.date = "Pick a date.";
      else if (onceDate < today) e.date = "That date has already passed.";
    } else {
      if (repeatMode === "weekly_until") {
        if (!endDate) e.endDate = "Pick an end date, or choose “Weekly, ongoing”.";
        else if (endDate < today) e.endDate = "That date has already passed.";
      }
    }
    // Every range needs days, a valid from–to, no overlaps, and room for at least one session.
    const windowProblem = repeatMode === "once" && !onceDate ? null : findWindowProblem(effectiveWindows, duration);
    if (windowProblem) e.times = windowProblem;
    if (!e.date && !e.endDate && !e.times && upcomingSlots.length === 0) e.schedule = "That schedule has no upcoming dates. Pick a date and time that hasn't passed yet.";
    if (conflicts.length > 0) e.schedule = `Overlaps with “${conflicts[0].otherTitle}” on ${formatDateLong(conflicts[0].date)} at ${formatTime12(conflicts[0].startTime)} IST. You can't run two sessions at once.`;
    return e;
  }, [title, free, priceNum, format, groupCapacity, repeatMode, onceDate, endDate, effectiveWindows, duration, upcomingSlots.length, conflicts, today]);

  const stepOf: Record<keyof FieldErrors, number> = { title: 0, price: 1, capacity: 1, date: 2, endDate: 2, times: 2, schedule: 2 };
  const errorSteps = new Set((Object.keys(errors) as (keyof FieldErrors)[]).map((k) => stepOf[k]));

  function goNext() {
    if (errorSteps.has(step)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(2, s + 1));
  }

  async function handleSubmit() {
    setServerError(null);
    if (errorSteps.size > 0) {
      setShowErrors(true);
      setStep(Math.min(...Array.from(errorSteps)));
      return;
    }
    setSubmitting(true);
    try {
      // "Once" is stored as an ordinary weekly offering whose date range is
      // pinned to that one day, so it yields exactly one occurrence and can
      // never turn into a standing slot.
      const payload = {
        token: mentorToken,
        title: title.replace(/\s+/g, " ").trim(),
        description: description.trim(),
        durationMinutes: duration,
        isFree: free,
        price: free ? 0 : priceNum,
        thumbnailUrl: thumbnailUrl.trim() || null,
        // Only sent when it changed, so saving still works on databases where
        // the poster_url column hasn't been added yet.
        ...((editing ? posterUrl !== (editing.posterUrl ?? "") : !!posterUrl.trim()) ? { posterUrl: posterUrl.trim() || null } : {}),
        recurringDays: windowDaysUnion(effectiveWindows),
        startTimes: cleanTimes, // summary only — the server derives it from dayWindows
        dayWindows: effectiveWindows,
        dateRangeStart: repeatMode === "once" ? onceDate : null,
        dateRangeEnd: repeatMode === "once" ? onceDate : repeatMode === "weekly_until" ? endDate || null : null,
        isOngoing: repeatMode === "weekly_ongoing",
        capacity,
        subject: subject.trim() || null,
      };
      if (editing) await updateOffering({ data: { ...payload, offeringId: editing.id } });
      else await createOffering({ data: payload });
      onCreated();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Couldn't save this session. Please try again.");
      setSubmitting(false);
    }
  }

  function updateWindow(key: number, patch: Partial<Pick<WindowRow, "days" | "start" | "end">>) {
    setWindows((prev) => prev.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  }
  function toggleWindowDay(key: number, d: DayOfWeek) {
    setWindows((prev) => prev.map((w) => (w.key === key ? { ...w, days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d] } : w)));
  }
  function addWindow() {
    setWindows((prev) => {
      if (prev.length >= MAX_WINDOWS) return prev;
      // Pre-select the days no other range uses yet — the usual "weekdays, then weekend" case.
      const used = new Set(prev.flatMap((w) => w.days));
      const free = DAY_ORDER.filter((d) => !used.has(d));
      const last = prev[prev.length - 1];
      return [...prev, { key: newKey(), days: free, start: last?.start ?? "10:00", end: last?.end ?? "12:00" }];
    });
  }

  const err = (k: keyof FieldErrors) => (showErrors && errors[k] ? errors[k] : null);
  const bad = (k: keyof FieldErrors) => (showErrors && errors[k] ? "!border-rose-400" : "");

  // The card students will see.
  const previewOffering = {
    id: "preview",
    title: title.trim() || "Your session title",
    description,
    subject: subject.trim() || null,
    durationMinutes: duration,
    isFree: free,
    price: free ? 0 : priceNum || 0,
    capacity,
    thumbnailUrl: thumbnailUrl || null,
    posterUrl: posterUrl || null,
    mentorName,
    mentorPhotoUrl,
  } as unknown as PublicMentorOffering;
  const nextSlot = upcomingSlots[0];
  const split = !free && priceNum >= 1 ? splitSessionPrice(Math.round(priceNum)) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={requestClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit session" : "New session"}
        className="clay flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-b-none !p-0 sm:rounded-b-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + stepper */}
        <div className="border-b border-border px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-foreground">{editing ? "Edit session" : "New session"}</h3>
            <button type="button" onClick={requestClose} className="grid h-8 w-8 place-items-center rounded-full text-foreground/45 hover:bg-foreground/5" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <ol className="mt-3 flex gap-2">
            {STEPS.map((label, i) => {
              const active = step === i;
              const hasError = showErrors && errorSteps.has(i);
              return (
                <li key={label} className="flex-1">
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={active ? "step" : undefined}
                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors ${
                      hasError ? "border-rose-300 bg-rose-50 text-rose-800" : active ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground/55 hover:border-foreground/30"
                    }`}
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${hasError ? "bg-rose-600 text-white" : active ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/15 text-primary" : "bg-foreground/10"}`}>
                      {i < step && !hasError ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            {step === 0 && (
              <>
                <Section label="What's this session about?">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Doubt clearing: Organic Chemistry"
                    aria-label="Session title"
                    className={`${inputClass} ${bad("title")}`}
                  />
                  <div className="mt-1 flex justify-between gap-3 text-[11px]">
                    <span className="font-medium text-rose-600">{err("title")}</span>
                    <span className="text-foreground/40">{title.length}/80</span>
                  </div>
                </Section>

                <Section label="Subject" hint="Students who score low in this subject get your session recommended.">
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={40} placeholder="e.g. Physics" aria-label="Subject" className={inputClass} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SUBJECT_SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => setSubject(subject === s ? "" : s)} className={chipBtn(subject === s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section label="What will students get out of it?" hint="Optional, but sessions with a description get booked more.">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    maxLength={600}
                    placeholder="Who is it for? What will you cover? What should they bring?"
                    aria-label="Description"
                    className={textareaClass}
                  />
                  <p className="mt-1 text-right text-[11px] text-foreground/40">{description.length}/600</p>
                </Section>

                <Section label="Cover image" hint="We use your profile photo until you add your own.">
                  <div className="space-y-4">
                    <SessionArtworkField label="Thumbnail" value={thumbnailUrl} onChange={setThumbnailUrl} storagePath={`mentor-sessions/${mentorToken.split(".")[0]}/thumbnails`} />
                    <SessionArtworkField
                      label="Poster (optional)"
                      shape="poster"
                      value={posterUrl}
                      onChange={setPosterUrl}
                      storagePath={`mentor-sessions/${mentorToken.split(".")[0]}/posters`}
                      hint="Portrait 4:5, e.g. 1080×1350. Shown in full, uncropped, instead of the thumbnail."
                    />
                  </div>
                </Section>
              </>
            )}

            {step === 1 && (
              <>
                <Section label="Who can join?">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {FORMATS.map((f) => {
                      const Icon = f.icon;
                      return (
                        <button key={f.key} type="button" onClick={() => setFormat(f.key)} aria-pressed={format === f.key} className={choiceCard(format === f.key)}>
                          <Icon className={`h-5 w-5 ${format === f.key ? "text-primary" : "text-foreground/45"}`} />
                          <span className="text-sm font-bold text-foreground">{f.title}</span>
                          <span className="text-xs text-foreground/55">{f.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  {format === "limited_group" && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm text-foreground/70">Max students per slot</span>
                      <div className="inline-flex items-center rounded-full border border-border">
                        <button type="button" onClick={() => setGroupCapacity((c) => Math.max(2, c - 1))} className="grid h-9 w-9 place-items-center text-foreground/60 hover:text-foreground" aria-label="Fewer students">
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          value={groupCapacity}
                          onChange={(e) => setGroupCapacity(Math.max(0, Math.min(MAX_SESSION_CAPACITY, Number(e.target.value.replace(/\D/g, "")) || 0)))}
                          inputMode="numeric"
                          aria-label="Max students"
                          className="w-12 bg-transparent text-center text-sm font-bold tabular-nums focus:outline-none"
                        />
                        <button type="button" onClick={() => setGroupCapacity((c) => Math.min(MAX_SESSION_CAPACITY - 1, c + 1))} className="grid h-9 w-9 place-items-center text-foreground/60 hover:text-foreground" aria-label="More students">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="mt-1 text-xs font-medium text-rose-600">{err("capacity")}</p>
                </Section>

                <Section label="How long is each session?">
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map((d) => (
                      <button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={duration === d} className={chipBtn(duration === d)}>
                        {d} min
                      </button>
                    ))}
                  </div>
                </Section>

                <Section label={format === "limited_group" ? "Price per student" : "Price"}>
                  {format === "open_unlimited" ? (
                    <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-foreground/70">Open-to-everyone sessions are always free.</p>
                  ) : (
                    <>
                      <div className="inline-flex rounded-full border border-border p-1">
                        {[
                          [true, "Free"],
                          [false, "Paid"],
                        ].map(([val, label]) => (
                          <button
                            key={String(label)}
                            type="button"
                            onClick={() => setIsFree(val as boolean)}
                            aria-pressed={isFree === val}
                            className={`min-h-9 rounded-full px-5 text-sm font-bold transition-colors ${isFree === val ? "bg-foreground text-background" : "text-foreground/65"}`}
                          >
                            {label as string}
                          </button>
                        ))}
                      </div>
                      {!isFree && (
                        <div className="mt-3">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-foreground/50">₹</span>
                            <input
                              value={price}
                              onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 5))}
                              inputMode="numeric"
                              placeholder="299"
                              aria-label="Price in rupees"
                              className={`${inputClass} !pl-8 ${bad("price")}`}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {PRICE_PRESETS.map((p) => (
                              <button key={p} type="button" onClick={() => setPrice(String(p))} className={chipBtn(priceNum === p)}>
                                ₹{p}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-xs font-medium text-rose-600">{err("price")}</p>
                          {split && (
                            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-3 text-center">
                              <div>
                                <dt className="text-[11px] text-foreground/50">Student pays</dt>
                                <dd className="text-sm font-bold tabular-nums">{inr.format(Math.round(priceNum))}</dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-foreground/50">Edurack fee ({SESSION_PLATFORM_COMMISSION_PERCENT}%)</dt>
                                <dd className="text-sm font-bold tabular-nums">−{inr.format(split.platformAmount)}</dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-foreground/50">You receive</dt>
                                <dd className="text-sm font-extrabold tabular-nums text-primary">{inr.format(split.mentorNetAmount)}</dd>
                              </div>
                            </dl>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </Section>
              </>
            )}

            {step === 2 && (
              <>
                <Section label="How often does this run?">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {REPEATS.map((r) => (
                      <button key={r.key} type="button" onClick={() => setRepeatMode(r.key)} aria-pressed={repeatMode === r.key} className={choiceCard(repeatMode === r.key)}>
                        <span className="text-sm font-bold text-foreground">{r.title}</span>
                        <span className="text-xs text-foreground/55">{r.desc}</span>
                      </button>
                    ))}
                  </div>
                </Section>

                {repeatMode === "once" && (
                  <Section label="Date">
                    <input type="date" value={onceDate} min={today} onChange={(e) => setOnceDate(e.target.value)} aria-label="Date" className={`${inputClass} sm:max-w-xs ${bad("date")}`} />
                    <p className="mt-1 text-xs font-medium text-rose-600">{err("date")}</p>
                  </Section>
                )}

                {repeatMode === "weekly_until" && (
                  <Section label="Repeat until">
                    <input type="date" value={endDate} min={today} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" className={`${inputClass} sm:max-w-xs ${bad("endDate")}`} />
                    <p className="mt-1 text-xs font-medium text-rose-600">{err("endDate")}</p>
                  </Section>
                )}

                <Section
                  label="When are you available? (IST)"
                  hint={
                    repeatMode === "once"
                      ? "Students can only book a session that fits inside this time range."
                      : "Set the hours you're free. Students can only book a session that fits inside the range for that day. Use another range if weekends differ from weekdays."
                  }
                >
                  <div className="space-y-3">
                    {windows.map((w, i) => {
                      const slotTimes = /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end) ? windowStartTimes(w, duration) : [];
                      return (
                        <div key={w.key} className={`rounded-2xl border bg-card p-3.5 ${bad("times") ? "!border-rose-300" : "border-border"}`}>
                          {repeatMode !== "once" && (
                            <>
                              <div className="grid grid-cols-7 gap-1.5">
                                {DAY_ORDER.map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => toggleWindowDay(w.key, d)}
                                    aria-pressed={w.days.includes(d)}
                                    className={`min-h-10 rounded-xl border text-xs font-bold transition-colors ${w.days.includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground/70 hover:border-foreground/30"}`}
                                  >
                                    {DAY_LABELS[d]}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {DAY_PRESETS.map((p) => (
                                  <button key={p.label} type="button" onClick={() => updateWindow(w.key, { days: p.days })} className={chipBtn(sameDays(w.days, p.days))}>
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          <div className={`flex flex-wrap items-center gap-2 ${repeatMode !== "once" ? "mt-3" : ""}`}>
                            <label className="flex items-center gap-2 text-xs font-semibold text-foreground/60">
                              From
                              <input type="time" value={w.start} onChange={(e) => updateWindow(w.key, { start: e.target.value })} aria-label={`Range ${i + 1} from`} className={`${inputClass} !w-auto`} />
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-foreground/60">
                              To
                              <input type="time" value={w.end} onChange={(e) => updateWindow(w.key, { end: e.target.value })} aria-label={`Range ${i + 1} to`} className={`${inputClass} !w-auto`} />
                            </label>
                            {windows.length > 1 && (
                              <button type="button" onClick={() => setWindows((prev) => prev.filter((x) => x.key !== w.key))} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70" aria-label="Remove time range">
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-foreground/55">
                            {slotTimes.length > 0
                              ? `${slotTimes.length} ${duration}-min session${slotTimes.length === 1 ? "" : "s"} per day: ${slotTimes.map(formatTime12).join(", ")}`
                              : "No session fits in this range yet."}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={addWindow} disabled={windows.length >= MAX_WINDOWS} className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-bold text-foreground/60 hover:border-foreground/40 disabled:opacity-40">
                    <Plus className="h-3.5 w-3.5" />
                    {repeatMode === "once" ? "Add another time range" : "Add a different time range (e.g. weekends)"}
                  </button>
                  <p className="mt-1 text-xs font-medium text-rose-600">{err("times")}</p>
                </Section>

                {/* What this schedule actually produces */}
                <div className={`rounded-2xl border p-4 ${err("schedule") ? "border-amber-300 bg-amber-50" : "border-border bg-secondary/50"}`}>
                  {err("schedule") || conflicts.length > 0 ? (
                    <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errors.schedule}</span>
                    </p>
                  ) : upcomingSlots.length === 0 ? (
                    <p className="text-sm text-foreground/55">Choose a date and a time to see when students can book.</p>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-foreground">
                        Students can book {upcomingSlots.length === 1 ? "1 session" : repeatMode === "weekly_ongoing" || !endDate ? "these times, and it keeps repeating" : `${upcomingSlots.length} sessions`}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {upcomingSlots.slice(0, 6).map((s) => (
                          <li key={`${s.date}-${s.startTime}`} className="rounded-full bg-background px-3 py-1 text-xs font-semibold tabular-nums text-foreground/80">
                            {relativeDay(s.date)} · {formatTime12(s.startTime)}
                          </li>
                        ))}
                        {upcomingSlots.length > 6 && <li className="px-1 py-1 text-xs text-foreground/50">+ more</li>}
                      </ul>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Live preview (desktop) */}
          <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-secondary/40 p-5 lg:block">
            <p className="mb-3 text-xs font-semibold text-foreground/55">What students will see</p>
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              <div className="relative">
                <SessionCover offering={previewOffering} className="aspect-[16/10] w-full" />
                {subject.trim() && <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-primary">{subject.trim()}</span>}
                <FormatBadge offering={{ capacity, isFree: free }} className="absolute right-3 top-3" />
                <span className="absolute bottom-3 left-3 rounded-full bg-foreground px-3 py-1 text-xs font-extrabold text-background">{priceLabel({ isFree: free, price: priceNum || 0 })}</span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <MentorAvatar name={mentorName} photoUrl={mentorPhotoUrl} size={22} />
                  <span className="truncate text-xs font-semibold text-foreground/55">{mentorName}</span>
                  <span className="ml-auto shrink-0 text-xs text-foreground/50">{duration} min</span>
                </div>
                <p className={`mt-1.5 font-display text-lg font-bold leading-snug tracking-tight ${title.trim() ? "text-foreground" : "text-foreground/30"}`}>{previewOffering.title}</p>
                {description.trim() && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-foreground/55">{description}</p>}
                <p className="mt-3 text-sm font-bold">{nextSlot ? `Next: ${relativeDay(nextSlot.date)} · ${formatTime12(nextSlot.startTime)} IST` : "No times set yet"}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-foreground/50">{formatLabel({ capacity, isFree: free })}{!free && split ? ` · you receive ${inr.format(split.mentorNetAmount)} per student` : ""}</p>
          </aside>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
          {serverError && (
            <p role="alert" className="mb-3 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-medium leading-relaxed text-rose-800">
              {serverError}
            </p>
          )}
          {showErrors && errorSteps.size > 0 && !serverError && <p className="mb-3 text-xs font-medium text-rose-600">Fix the highlighted fields to continue.</p>}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting} className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold disabled:invisible">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {step < 2 ? (
              <button type="button" onClick={goNext} className="clay-btn inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold">
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting} className="clay-btn inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarTime className="h-4 w-4" />}
                {editing ? "Save changes" : "Publish session"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-bold text-foreground">{label}</h4>
      {hint && <p className="mb-2 mt-0.5 text-xs text-foreground/50">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}
