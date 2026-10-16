import { useEffect, useMemo, useState } from "react";
import { IconLoader2 as Loader2, IconPlus as Plus, IconTrash as Trash2, IconCalendarTime as CalendarTime, IconUsers as Users, IconLink as LinkIcon, IconClock as Clock } from "@tabler/icons-react";
import { listMyOfferings, setOfferingActive, deleteOffering, listMyBookings, setMeetingLinkForSession } from "@/server-functions/mentor-sessions";
import { UNLIMITED_CAPACITY, isUnlimitedOffering, describeSchedule, type MentorSessionOffering, type MentorSessionBooking } from "@/lib/session-types";
import { SessionCalendar } from "@/components/session-calendar";
import { expandOfferingToSlots } from "@/lib/session-slots";
import { useTour, OnboardingTour, type TourStep } from "@/components/shared/onboarding-tour";
import { IconCopy as Copy, IconAlertTriangle as AlertTriangle, IconCircleCheck as CircleCheck, IconRefresh as Refresh, IconExternalLink as ExternalLink } from "@tabler/icons-react";
import { cancelSessionAsMentor, completeSession, setBookingNoShow } from "@/server-functions/mentor-sessions";
import { ModuleHeader, StatStrip, Skeleton, EmptyState, ErrorBanner, SuccessBanner, LiveDot, inputClass, textareaClass } from "@/components/mentor-portal-ui";
import { SESSION_PLATFORM_COMMISSION_PERCENT } from "@/lib/session-types";
import { formatDateLong, formatTimeRange, dayParts, timeUntilLabel, slotStart, slotEnd } from "@/lib/session-time";
import { SITE_URL } from "@/lib/seo";
import { MentorOfferingDialog } from "@/components/mentor-offering-dialog";

const SESSIONS_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="sessions-tabs"]',
    title: "Run your sessions from here",
    description:
      "Upcoming shows every session students have booked, with its roster. Past is where you wrap sessions up. Offerings is where you publish the times students can book.",
  },
  {
    selector: '[data-tour="sessions-content"]',
    title: "Everything has an action",
    description:
      "Add the meeting link, cancel a session (paid students are refunded automatically), mark it complete afterwards, and flag no-shows. Students are emailed when something changes.",
  },
];

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type SessionTab = "upcoming" | "past" | "offerings" | "calendar";
type Notice = { tone: "ok" | "err"; text: string } | null;

// One concrete session = one offering on one date at one time, with everyone
// booked into it.
type Instance = {
  key: string;
  offeringId: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  capacity: number;
  bookings: MentorSessionBooking[];
  active: MentorSessionBooking[]; // not cancelled
  start: Date;
  end: Date;
  link: string | null;
};

function useTick(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function MentorSessionsModule({ mentorToken }: { mentorToken: string }) {
  const [tab, setTab] = useState<SessionTab>("upcoming");
  const [offerings, setOfferings] = useState<MentorSessionOffering[] | null>(null);
  const [bookings, setBookings] = useState<MentorSessionBooking[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingOffering, setEditingOffering] = useState<MentorSessionOffering | null>(null);
  const [cancelling, setCancelling] = useState<Instance | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useTick();
  const tour = useTour("mentorTourSessionsSeen");

  async function loadOfferings() {
    const { offerings: rows } = await listMyOfferings({ data: { token: mentorToken } });
    setOfferings(rows as MentorSessionOffering[]);
  }
  async function loadBookings() {
    const { bookings: rows } = await listMyBookings({ data: { token: mentorToken } });
    setBookings(rows as MentorSessionBooking[]);
  }
  async function loadAll() {
    setLoadError(false);
    try {
      await Promise.all([loadOfferings(), loadBookings()]);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs one action, refreshes bookings, and reports the outcome in a banner.
  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key);
    setNotice(null);
    try {
      const message = await action();
      await loadBookings();
      if (message) setNotice({ tone: "ok", text: message });
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const capacityByOffering = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offerings ?? []) m.set(o.id, o.capacity);
    return m;
  }, [offerings]);

  const instances = useMemo<Instance[]>(() => {
    if (!bookings) return [];
    const byKey = new Map<string, Instance>();
    for (const b of bookings) {
      const key = `${b.offeringId}:${b.sessionDate}:${b.startTime}`;
      let inst = byKey.get(key);
      if (!inst) {
        const date = b.sessionDate.slice(0, 10);
        const time = b.startTime.slice(0, 5);
        inst = {
          key,
          offeringId: b.offeringId,
          title: b.offeringTitle ?? "Session",
          date,
          time,
          duration: b.durationMinutes,
          capacity: capacityByOffering.get(b.offeringId) ?? 1,
          bookings: [],
          active: [],
          start: slotStart(date, time),
          end: slotEnd(date, time, b.durationMinutes),
          link: null,
        };
        byKey.set(key, inst);
      }
      inst.bookings.push(b);
      if (b.status !== "cancelled") inst.active.push(b);
      if (b.meetingLink && !inst.link) inst.link = b.meetingLink;
    }
    return Array.from(byKey.values());
  }, [bookings, capacityByOffering]);

  const upcoming = useMemo(
    () => instances.filter((i) => i.active.length > 0 && i.end > now).sort((a, b) => a.start.getTime() - b.start.getTime()),
    [instances, now],
  );
  const past = useMemo(
    () => instances.filter((i) => i.active.length === 0 || i.end <= now).sort((a, b) => b.start.getTime() - a.start.getTime()),
    [instances, now],
  );
  const needWrapUp = past.filter((i) => i.active.some((b) => b.status === "upcoming")).length;

  const upcomingStudents = upcoming.reduce((n, i) => n + i.active.length, 0);
  const earned = (bookings ?? []).filter((b) => b.paymentStatus === "paid" && b.status !== "cancelled").reduce((n, b) => n + b.mentorNetAmount, 0);
  const liveOfferings = (offerings ?? []).filter((o) => o.active).length;
  const upcomingByOffering = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of upcoming) m.set(i.offeringId, (m.get(i.offeringId) ?? 0) + i.active.length);
    return m;
  }, [upcoming]);

  const nextUp = upcoming[0] ?? null;
  const tabs: { key: SessionTab; label: string; count?: number | null }[] = [
    { key: "upcoming", label: "Upcoming", count: bookings ? upcoming.length : null },
    { key: "past", label: "Past", count: bookings ? past.length : null },
    { key: "offerings", label: "Offerings", count: offerings ? offerings.length : null },
    { key: "calendar", label: "Calendar" },
  ];

  return (
    <div>
      <ModuleHeader
        title="Sessions"
        subtitle="Publish open time for students to book, then run each session from here: share the link, wrap it up, and handle cancellations."
        onHelp={tour.start}
        action={
          <button onClick={() => setShowCreate(true)} className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold transition-transform">
            <Plus className="h-4 w-4" />
            New session
          </button>
        }
      />

      <StatStrip
        className="mb-5"
        items={[
          {
            label: "Upcoming sessions",
            value: bookings ? upcoming.length : null,
            hint: bookings ? (nextUp ? `Next: ${formatDateLong(nextUp.date)}` : "Nothing booked yet") : null,
          },
          { label: "Students booked", value: bookings ? upcomingStudents : null, hint: bookings ? "Across upcoming sessions" : null },
          {
            label: "Session earnings",
            value: bookings ? currency.format(earned) : null,
            hint: bookings ? `After the ${SESSION_PLATFORM_COMMISSION_PERCENT}% platform fee` : null,
          },
          {
            label: "Live offerings",
            value: offerings ? liveOfferings : null,
            hint: offerings ? (offerings.length - liveOfferings > 0 ? `${offerings.length - liveOfferings} paused` : "All live") : null,
            onClick: () => setTab("offerings"),
          },
        ]}
      />

      <div data-tour="sessions-tabs" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${tab === t.key ? "clay-btn text-white" : "clay-chip text-foreground/70"}`}
          >
            {t.label}
            {t.count != null ? ` (${t.count})` : ""}
            {t.key === "past" && needWrapUp > 0 && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" title={`${needWrapUp} to wrap up`} />}
          </button>
        ))}
      </div>

      {notice && <div className="mb-4">{notice.tone === "ok" ? <SuccessBanner message={notice.text} /> : <ErrorBanner message={notice.text} />}</div>}

      <div data-tour="sessions-content">
        {loadError ? (
          <div className="space-y-3">
            <ErrorBanner message="Couldn't load your sessions." />
            <button onClick={loadAll} className="clay-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-xs">
              <Refresh className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        ) : tab === "offerings" ? (
          <OfferingsGrid
            offerings={offerings}
            upcomingByOffering={upcomingByOffering}
            onCreate={() => setShowCreate(true)}
            onEdit={setEditingOffering}
            onToggleActive={(id, active) =>
              run(`toggle-${id}`, async () => {
                await setOfferingActive({ data: { token: mentorToken, offeringId: id, active } });
                await loadOfferings();
                return active ? "Offering is live again." : "Offering paused. Existing bookings are unaffected; no new ones can be made.";
              })
            }
            onDelete={(o) => {
              if (!confirm(`Delete "${o.title}"? Past bookings are kept, but students can no longer book it.`)) return;
              run(`delete-${o.id}`, async () => {
                await deleteOffering({ data: { token: mentorToken, offeringId: o.id } });
                await loadOfferings();
                return "Offering deleted.";
              });
            }}
            onCopied={() => setNotice({ tone: "ok", text: "Link copied. Share it with students, on Instagram, or in your Telegram group." })}
          />
        ) : tab === "calendar" ? (
          <MentorCalendarTab
            offerings={offerings}
            bookings={bookings}
            onSetLink={async (offeringId, sessionDate, startTime, link) => {
              await setMeetingLinkForSession({ data: { token: mentorToken, offeringId, sessionDate, startTime, meetingLink: link } });
              loadBookings();
            }}
          />
        ) : bookings === null ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : tab === "upcoming" ? (
          upcoming.length === 0 ? (
            <div className="clay p-2">
              <EmptyState
                icon={CalendarTime}
                message={
                  (offerings?.length ?? 0) === 0
                    ? "No one can book you yet. Publish your first session and share the link."
                    : "No upcoming bookings. Share an offering's link and the first student to book shows up here."
                }
                action={
                  (offerings?.length ?? 0) === 0
                    ? { label: "Create a session", onClick: () => setShowCreate(true) }
                    : { label: "See your offerings", onClick: () => setTab("offerings") }
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((i, idx) => (
                <RosterCard
                  key={i.key}
                  inst={i}
                  now={now}
                  featured={idx === 0}
                  busy={busy}
                  onSetLink={(link) =>
                    run(`link-${i.key}`, async () => {
                      await setMeetingLinkForSession({ data: { token: mentorToken, offeringId: i.offeringId, sessionDate: i.date, startTime: i.time, meetingLink: link } });
                      return "Meeting link saved. Students can see it in My Sessions.";
                    })
                  }
                  onCancel={() => setCancelling(i)}
                  onComplete={() =>
                    run(`done-${i.key}`, async () => {
                      await completeSession({ data: { token: mentorToken, offeringId: i.offeringId, sessionDate: i.date, startTime: i.time } });
                      return "Marked as completed.";
                    })
                  }
                  onNoShow={(b, noShow) =>
                    run(`noshow-${b.id}`, async () => {
                      await setBookingNoShow({ data: { token: mentorToken, bookingId: b.id, noShow } });
                      return noShow ? `${b.studentName} marked as a no-show.` : `${b.studentName} marked as attended.`;
                    })
                  }
                />
              ))}
            </div>
          )
        ) : past.length === 0 ? (
          <div className="clay p-2">
            <EmptyState icon={CircleCheck} message="Sessions you've run or cancelled will collect here." />
          </div>
        ) : (
          <div className="space-y-3">
            {needWrapUp > 0 && (
              <p className="clay-inset flex items-start gap-2 rounded-2xl bg-[var(--lemon-soft)]/50 px-4 py-3 text-xs font-medium text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {needWrapUp} finished session{needWrapUp === 1 ? " is" : "s are"} still marked upcoming. Mark {needWrapUp === 1 ? "it" : "them"} complete so records and your students' history stay accurate.
              </p>
            )}
            {past.map((i) => (
              <RosterCard
                key={i.key}
                inst={i}
                now={now}
                busy={busy}
                onSetLink={() => {}}
                onCancel={() => {}}
                onComplete={() =>
                  run(`done-${i.key}`, async () => {
                    await completeSession({ data: { token: mentorToken, offeringId: i.offeringId, sessionDate: i.date, startTime: i.time } });
                    return "Marked as completed.";
                  })
                }
                onNoShow={(b, noShow) =>
                  run(`noshow-${b.id}`, async () => {
                    await setBookingNoShow({ data: { token: mentorToken, bookingId: b.id, noShow } });
                    return noShow ? `${b.studentName} marked as a no-show.` : `${b.studentName} marked as attended.`;
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {cancelling && (
        <CancelSessionDialog
          inst={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            const inst = cancelling;
            setCancelling(null);
            await run(`cancel-${inst.key}`, async () => {
              const res = await cancelSessionAsMentor({
                data: { token: mentorToken, offeringId: inst.offeringId, sessionDate: inst.date, startTime: inst.time, reason },
              });
              const parts = [`Session cancelled. ${res.cancelled} student${res.cancelled === 1 ? " was" : "s were"} notified by email.`];
              if (res.refunded > 0) parts.push(`${res.refunded} paid booking${res.refunded === 1 ? " was" : "s were"} refunded in full.`);
              if (res.refundFailures > 0) parts.push(`${res.refundFailures} refund${res.refundFailures === 1 ? "" : "s"} couldn't be processed automatically. Contact Edurack support so no student is left out of pocket.`);
              return parts.join(" ");
            });
          }}
        />
      )}

      {showCreate && (
        <MentorOfferingDialog
          mentorToken={mentorToken}
          existing={offerings ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadOfferings();
            setTab("offerings");
          }}
        />
      )}

      {editingOffering && (
        <MentorOfferingDialog
          key={editingOffering.id}
          mentorToken={mentorToken}
          editing={editingOffering}
          existing={offerings ?? []}
          onClose={() => setEditingOffering(null)}
          onCreated={() => {
            setEditingOffering(null);
            loadOfferings();
          }}
        />
      )}

      {tour.active && <OnboardingTour steps={SESSIONS_TOUR_STEPS} onFinish={tour.finish} />}
    </div>
  );
}

// ── One session + its roster ───────────────────────────────────────────
function RosterCard({
  inst,
  now,
  featured = false,
  busy,
  onSetLink,
  onCancel,
  onComplete,
  onNoShow,
}: {
  inst: Instance;
  now: Date;
  featured?: boolean;
  busy: string | null;
  onSetLink: (link: string) => void;
  onCancel: () => void;
  onComplete: () => void;
  onNoShow: (b: MentorSessionBooking, noShow: boolean) => void;
}) {
  const [editingLink, setEditingLink] = useState(false);
  const [draft, setDraft] = useState(inst.link ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const p = dayParts(inst.date);
  const started = inst.start <= now;
  const ended = inst.end <= now;
  const live = started && !ended;
  const allCancelled = inst.active.length === 0;
  const msUntil = inst.start.getTime() - now.getTime();
  const unlimited = inst.capacity >= UNLIMITED_CAPACITY;
  const isGroup = inst.capacity > 1 && !unlimited;
  const pending = inst.active.some((b) => b.status === "upcoming");
  const linkUrgent = !inst.link && !ended && !allCancelled && msUntil < 48 * 3_600_000;
  const rows = showAll ? inst.bookings : inst.bookings.slice(0, 4);
  const paidCount = inst.active.filter((b) => b.paymentStatus === "paid").length;

  function saveLink() {
    const v = draft.trim();
    if (!/^https?:\/\/\S+$/.test(v)) {
      setLinkError("Paste a full link starting with https://");
      return;
    }
    setLinkError(null);
    onSetLink(v);
    setEditingLink(false);
  }

  return (
    <div className={`clay p-4 sm:p-5 ${featured ? "border-primary/40" : ""}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-center ${allCancelled ? "bg-foreground/5 text-foreground/40" : ended ? "bg-foreground/5" : "bg-primary text-primary-foreground"}`}>
          <div>
            <p className="font-display text-xl font-extrabold leading-none tabular-nums">{p.day}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-80">{p.month}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold text-foreground">{inst.title}</p>
            {allCancelled ? (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-900">Cancelled</span>
            ) : live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                <LiveDot className="scale-75" /> Live now
              </span>
            ) : !started && msUntil < 24 * 3_600_000 ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">Starts in {timeUntilLabel(msUntil)}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-foreground/55">
            {formatDateLong(inst.date)} · {formatTimeRange(inst.time, inst.duration)} IST · {inst.duration} min
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-foreground/60">
            <Users className="h-3.5 w-3.5 text-foreground/35" />
            {unlimited ? `${inst.active.length} joined` : isGroup ? `${inst.active.length} of ${inst.capacity} seats booked` : inst.active.length === 1 ? "1:1 booked" : `${inst.active.length} booked`}
          </p>
        </div>
      </div>

      {/* Meeting link */}
      {!allCancelled && !ended && (
        <div className={`mt-4 rounded-2xl px-3.5 py-3 ${linkUrgent ? "bg-[var(--lemon-soft)]/60" : "clay-inset"}`}>
          {editingLink ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="https://meet.google.com/…"
                  aria-label="Meeting link"
                  className={`${inputClass} !rounded-xl !py-2 text-xs`}
                  autoFocus
                />
                <button onClick={saveLink} disabled={busy === `link-${inst.key}`} className="clay-btn shrink-0 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60">
                  Save
                </button>
                <button onClick={() => { setEditingLink(false); setLinkError(null); }} className="shrink-0 text-xs font-semibold text-foreground/50 hover:text-foreground/80">
                  Cancel
                </button>
              </div>
              {linkError && <p className="mt-1.5 text-[11px] font-medium text-rose-700">{linkError}</p>}
            </div>
          ) : inst.link ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <a href={inst.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-[var(--sky-deep)] hover:underline">
                <LinkIcon className="h-3.5 w-3.5" />
                Open meeting
                <ExternalLink className="h-3 w-3" />
              </a>
              <span className="min-w-0 flex-1 truncate text-foreground/45">{inst.link}</span>
              <button onClick={() => { setDraft(inst.link ?? ""); setEditingLink(true); }} className="font-semibold text-foreground/55 hover:text-foreground">
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70">
                {linkUrgent && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                {linkUrgent ? "No meeting link yet — students can't join without one." : "No meeting link yet."}
              </p>
              <button onClick={() => setEditingLink(true)} className="clay-btn rounded-full px-3.5 py-1.5 text-xs font-semibold">
                Add meeting link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Roster */}
      <ul className="mt-4 space-y-1.5">
        {rows.map((s) => (
          <li key={s.id} className="clay-inset flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{s.studentName.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${s.status === "cancelled" ? "text-foreground/40 line-through" : "text-foreground"}`}>{s.studentName}</p>
              {s.studentNote && <p className="truncate text-xs italic text-foreground/50">“{s.studentNote}”</p>}
            </div>
            <PaymentPill b={s} />
            {s.status === "no_show" && <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold text-foreground/60">No-show</span>}
            {s.status === "cancelled" && <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900">Cancelled</span>}
            {started && s.status !== "cancelled" && (
              <button
                onClick={() => onNoShow(s, s.status !== "no_show")}
                disabled={busy === `noshow-${s.id}`}
                className="shrink-0 text-[11px] font-semibold text-foreground/45 hover:text-foreground/80 disabled:opacity-50"
              >
                {s.status === "no_show" ? "Mark attended" : "Mark no-show"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {inst.bookings.length > 4 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-[var(--sky-deep)] hover:underline">
          {showAll ? "Show fewer" : `Show all ${inst.bookings.length} students`}
        </button>
      )}

      {/* Actions */}
      {!allCancelled && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          {pending && started ? (
            <button onClick={onComplete} disabled={busy === `done-${inst.key}`} className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60">
              <CircleCheck className="h-3.5 w-3.5" />
              Mark session complete
            </button>
          ) : (
            <span />
          )}
          {!started && (
            <button onClick={onCancel} disabled={busy === `cancel-${inst.key}`} className="clay-btn-ghost rounded-full px-3.5 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60">
              Cancel session{paidCount > 0 ? " & refund" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentPill({ b }: { b: MentorSessionBooking }) {
  if (b.paymentStatus === "refunded") return <span className="shrink-0 text-xs font-bold text-foreground/45">Refunded</span>;
  if (b.isFree || b.paymentStatus === "free") return <span className="shrink-0 text-xs font-bold text-foreground/55">Free</span>;
  if (b.paymentStatus === "paid") return <span className="shrink-0 text-xs font-bold text-[var(--sky-deep)]">{currency.format(b.mentorNetAmount)} earned</span>;
  return <span className="shrink-0 text-xs font-bold text-foreground/45">{b.paymentStatus}</span>;
}

// ── Cancel a whole session ─────────────────────────────────────────────
function CancelSessionDialog({ inst, onClose, onConfirm }: { inst: Instance; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const paid = inst.active.filter((b) => b.paymentStatus === "paid").length;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Cancel session" className="clay w-full max-w-md rounded-b-none p-6 sm:rounded-b-3xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-foreground">Cancel this session?</h3>
        <p className="mt-1 text-sm text-foreground/60">
          {inst.title} · {formatDateLong(inst.date)}, {formatTimeRange(inst.time, inst.duration)} IST
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-foreground/75">
          <li>
            {inst.active.length} student{inst.active.length === 1 ? "" : "s"} will be emailed straight away.
          </li>
          {paid > 0 && (
            <li>
              {paid} paid booking{paid === 1 ? "" : "s"} will be <strong>refunded in full automatically</strong>.
            </li>
          )}
          <li>The time slot reopens, so other students can book it again.</li>
        </ul>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-foreground/60">Message to students (optional)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. I'm unwell. I'll reopen slots next week." className={textareaClass} />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="clay-btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold">
            Keep session
          </button>
          <button onClick={() => onConfirm(reason)} className="rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700">
            Cancel session
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Offerings ──────────────────────────────────────────────────────────
function OfferingsGrid({
  offerings,
  upcomingByOffering,
  onCreate,
  onEdit,
  onToggleActive,
  onDelete,
  onCopied,
}: {
  offerings: MentorSessionOffering[] | null;
  upcomingByOffering: Map<string, number>;
  onCreate: () => void;
  onEdit: (o: MentorSessionOffering) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (o: MentorSessionOffering) => void;
  onCopied: () => void;
}) {
  if (offerings === null) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (offerings.length === 0) {
    return (
      <div className="clay p-2">
        <EmptyState icon={CalendarTime} message="You haven't published any sessions yet. Choose when you're free, set a price (or make it free), and students can book." action={{ label: "Create your first session", onClick: onCreate }} />
      </div>
    );
  }

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/mentor-session/${id}`);
      onCopied();
    } catch {
      window.prompt("Copy this link:", `${SITE_URL}/mentor-session/${id}`);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {offerings.map((o) => {
        const upcomingN = upcomingByOffering.get(o.id) ?? 0;
        const cover = o.posterUrl ?? o.thumbnailUrl;
        return (
          <div key={o.id} className={`clay flex flex-col overflow-hidden ${o.active ? "" : "opacity-80"}`}>
            {cover && (
              <div className="h-32 w-full overflow-hidden bg-foreground/5">
                <img src={cover} alt="" className="h-full w-full object-cover object-top" />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-display text-base font-bold leading-snug text-foreground">{o.title}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${o.active ? "bg-[var(--mint-soft)] text-foreground" : "bg-foreground/10 text-foreground/55"}`}>
                  {o.active ? "Live" : "Paused"}
                </span>
              </div>
              <p className="text-xs text-foreground/55">
                {o.durationMinutes} min · {o.isFree ? "Free" : currency.format(o.price)}
                {isUnlimitedOffering(o) ? " · open to everyone" : o.capacity > 1 ? ` · up to ${o.capacity} students` : " · 1:1"}
                {o.subject ? ` · ${o.subject}` : ""}
              </p>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70">
                <Clock className="h-3.5 w-3.5 text-foreground/30" />
                {describeSchedule(o)}
              </p>
              <p className="text-xs text-foreground/50">{upcomingN > 0 ? `${upcomingN} student${upcomingN === 1 ? "" : "s"} booked upcoming` : "No upcoming bookings"}</p>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                <button onClick={() => copyLink(o.id)} className="clay-btn inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold">
                  <Copy className="h-3.5 w-3.5" />
                  Copy student link
                </button>
                <a href={`/mentor-session/${o.id}`} target="_blank" rel="noreferrer" className="clay-btn-ghost inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold">
                  Preview
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={() => onEdit(o)} className="clay-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold">
                  Edit
                </button>
                <button onClick={() => onToggleActive(o.id, !o.active)} className="clay-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold">
                  {o.active ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => onDelete(o)}
                  disabled={upcomingN > 0}
                  title={upcomingN > 0 ? "Cancel its upcoming sessions first, or pause it instead" : "Delete this offering"}
                  className="clay-btn-ghost ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Groups bookings into one card per session instance — for a 1:1 offering
// that's one student; for a group offering it's the whole roster, with one
// shared meeting-link field for everyone in that session.
type MentorCalendarEvent = {
  date: string;
  startTime: string;
  offeringId: string;
  title: string;
  durationMinutes: number;
  capacity: number;
  students: MentorSessionBooking[];
};

// Every upcoming instance of every offering on one calendar — instances
// with bookings (from the roster data) AND instances still open with no
// bookings yet (expanded from the offering's schedule), so the mentor sees
// the true shape of their week, not just the days students happened to book.
function MentorCalendarTab({
  offerings,
  bookings,
  onSetLink,
}: {
  offerings: MentorSessionOffering[] | null;
  bookings: MentorSessionBooking[] | null;
  onSetLink: (offeringId: string, sessionDate: string, startTime: string, link: string) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const events = useMemo<MentorCalendarEvent[]>(() => {
    if (!offerings || !bookings) return [];
    const active = bookings.filter((b) => b.status !== "cancelled");

    const byKey = new Map<string, MentorCalendarEvent>();
    const seatCounts = new Map<string, number>();
    const offeringById = new Map(offerings.map((o) => [o.id, o]));

    for (const b of active) {
      const key = `${b.offeringId}:${b.sessionDate}:${b.startTime}`;
      seatCounts.set(key, (seatCounts.get(key) ?? 0) + 1);
      const existing = byKey.get(key);
      if (existing) existing.students.push(b);
      else
        byKey.set(key, {
          date: b.sessionDate,
          startTime: b.startTime,
          offeringId: b.offeringId,
          title: b.offeringTitle ?? offeringById.get(b.offeringId)?.title ?? "Session",
          durationMinutes: b.durationMinutes,
          capacity: offeringById.get(b.offeringId)?.capacity ?? 1,
          students: [b],
        });
    }

    // Open (not-yet-booked) instances over the next ~2 months.
    for (const o of offerings) {
      for (const s of expandOfferingToSlots(o, seatCounts, 60)) {
        const key = `${s.offeringId}:${s.date}:${s.startTime}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          date: s.date,
          startTime: s.startTime,
          offeringId: o.id,
          title: o.title,
          durationMinutes: o.durationMinutes,
          capacity: o.capacity,
          students: [],
        });
      }
    }
    return Array.from(byKey.values());
  }, [offerings, bookings]);

  if (offerings === null || bookings === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <SessionCalendar
      events={events}
      emptyDayLabel="No sessions scheduled this day."
      renderEvent={(e) => {
        const key = `${e.offeringId}:${e.date}:${e.startTime}`;
        const existingLink = e.students.find((s) => s.meetingLink)?.meetingLink ?? null;
        const unlimited = e.capacity >= UNLIMITED_CAPACITY;
        const seatLabel = unlimited
          ? `${e.students.length} joined`
          : e.capacity > 1
            ? `${e.students.length}/${e.capacity} booked`
            : e.students.length > 0
              ? "Booked"
              : "Open";
        return (
          <div key={key} className="clay-inset rounded-2xl px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{e.title}</p>
                <p className="text-xs text-foreground/50">
                  {e.startTime} · {e.durationMinutes} min
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  e.students.length > 0 ? "bg-[var(--mint-soft)]/60 text-foreground" : "bg-foreground/5 text-foreground/50"
                }`}
              >
                {seatLabel}
              </span>
            </div>

            {e.students.length > 0 && (
              <p className="mt-2 text-xs text-foreground/60">{e.students.map((s) => s.studentName).join(", ")}</p>
            )}

            {e.students.length > 0 &&
              (editingKey === key ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    placeholder="Meeting link"
                    className="clay-inset min-w-0 flex-1 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      onSetLink(e.offeringId, e.date, e.startTime, draft);
                      setEditingKey(null);
                    }}
                    className="clay-btn rounded-full px-3 py-1.5 text-xs font-semibold"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  {existingLink && (
                    <a href={existingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)] hover:underline">
                      <LinkIcon className="h-3.5 w-3.5" />
                      Join link
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setDraft(existingLink ?? "");
                      setEditingKey(key);
                    }}
                    className="text-xs font-semibold text-foreground/50 hover:text-foreground/80"
                  >
                    {existingLink ? "Change link" : "Add meeting link"}
                  </button>
                </div>
              ))}
          </div>
        );
      }}
    />
  );
}
