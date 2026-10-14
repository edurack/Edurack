// Mentor home screen. Answers, in order: what's next, what needs me, how am I
// doing. Same server calls as before (listMyAssignedBatches,
// listMentorshipSessions, listChatThreads, listMyMentorTickets,
// getMentorProfileCompleteness, getMentorEarningsOverview,
// getTestSeriesAccessStatus) — the agenda and the earnings load
// independently, so a slow or failing earnings query no longer blanks the
// whole page (the old version showed a spinner forever if any call threw).
import { useEffect, useMemo, useState } from "react";
import {
  IconCalendarClock as CalendarClock,
  IconMessageCircle as MessageSquare,
  IconLifebuoy as LifeBuoy,
  IconArrowRight as ArrowRight,
  IconSparkles as Sparkles,
  IconVideo as Video,
  IconUsersGroup as Users2,
  IconPlayerPlayFilled as PlayCircle,
  IconCurrencyRupee as IndianRupee,
  IconClipboardList as ClipboardList,
  IconLock as Lock,
  IconLoader2 as Loader2,
  IconHelpCircle as HelpCircle,
  IconRefresh as Refresh,
} from "@tabler/icons-react";
import {
  listMyAssignedBatches,
  listMentorshipSessions,
  listChatThreads,
  listMyMentorTickets,
} from "@/server-functions/mentor-portal";
import { getMentorProfileCompleteness } from "@/server-functions/mentor-auth";
import {
  getMentorEarningsOverview,
  getTestSeriesAccessStatus,
  requestTestSeriesAccess,
} from "@/server-functions/mentor-earnings";
import type { MentorEarningsOverview, TestSeriesAccessStatus } from "@/lib/admin-types";
import {
  Panel,
  StatStrip,
  Skeleton,
  EmptyState,
  ErrorBanner,
  LiveDot,
  type IconType,
} from "@/components/mentor-portal-ui";
import { useTour, OnboardingTour, type TourStep } from "@/components/shared/onboarding-tour";

const OVERVIEW_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="overview-hero"]',
    title: "Your day, first",
    description:
      "A countdown to your next session with a one-tap Join, and the things waiting on you: unanswered students, open tickets, an unfinished profile.",
  },
  {
    selector: '[data-tour="overview-stats"]',
    title: "The numbers that matter",
    description: "This month's earnings against last month, lifetime earnings, your batches and your paying students.",
  },
  {
    selector: '[data-tour="overview-schedule"]',
    title: "Coming up",
    description: "Everything scheduled across all your batches, grouped by day. Open the batch schedule to add or change sessions.",
  },
  {
    selector: '[data-tour="overview-earnings"]',
    title: "Earnings",
    description: "Six months of net earnings, plus every payment behind the numbers.",
  },
];

type ModuleKey =
  | "overview"
  | "profile"
  | "announcements"
  | "scheduler"
  | "chat"
  | "support"
  | "library"
  | "testSeries"
  | "sessions"
  | "sellTests";

type SessionRow = {
  id: string;
  batchId: string;
  batchName: string;
  track: "OneOnOne" | "BatchMeet" | "AsyncLecture";
  scheduledAt: string;
  durationMinutes?: number | null;
  status: string;
  meetingLink: string | null;
};

type ThreadRow = {
  studentUid: string;
  studentName: string;
  batchName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  lastSender: "mentor" | "student";
};

type AgendaData = {
  batchCount: number;
  scheduled: SessionRow[]; // every still-scheduled session, soonest first
  threads: ThreadRow[]; // newest first
  openTicketCount: number;
  completenessPercent: number;
  missing: string[];
};

const TRACK_ICON: Record<SessionRow["track"], IconType> = { OneOnOne: Users2, BatchMeet: Video, AsyncLecture: PlayCircle };
const TRACK_LABEL: Record<SessionRow["track"], string> = { OneOnOne: "1:1", BatchMeet: "Batch meet", AsyncLecture: "Lecture" };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const DEFAULT_SESSION_MINUTES = 60;

// ── time helpers ───────────────────────────────────────────────────────
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function greeting(hour: number) {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function untilLabel(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

function timeAgo(iso: string | null, now: number) {
  if (!iso) return "";
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const endMs = (s: SessionRow) => new Date(s.scheduledAt).getTime() + (s.durationMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// The last `n` calendar months INCLUDING empty ones, so a quiet month shows as
// a short bar instead of silently disappearing from the trend.
function lastMonths(n: number, monthly: MentorEarningsOverview["monthly"]) {
  const byKey = new Map(monthly.map((m) => [m.month, m]));
  const base = new Date();
  base.setDate(1);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() - (n - 1 - i), 1);
    const k = monthKey(d);
    return {
      key: k,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      net: byKey.get(k)?.netEarned ?? 0,
      count: byKey.get(k)?.purchaseCount ?? 0,
    };
  });
}

// ── main ───────────────────────────────────────────────────────────────
export function MentorOverviewModule({
  mentorToken,
  mentorName,
  onNavigate,
}: {
  mentorToken: string;
  mentorName: string;
  onNavigate: (key: ModuleKey) => void;
}) {
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [agendaError, setAgendaError] = useState(false);
  const [earnings, setEarnings] = useState<MentorEarningsOverview | null>(null);
  const [earningsError, setEarningsError] = useState(false);
  const tour = useTour("mentorTourOverviewSeen");
  const now = useNow();

  async function loadAgenda() {
    setAgendaError(false);
    try {
      const [{ batches }, completeness, { tickets }] = await Promise.all([
        listMyAssignedBatches({ data: { token: mentorToken } }),
        getMentorProfileCompleteness({ data: { token: mentorToken } }),
        listMyMentorTickets({ data: { token: mentorToken } }),
      ]);

      // One bad batch shouldn't take the whole home screen down with it.
      const perBatch = await Promise.all(
        batches.map(async (b) => {
          const [s, t] = await Promise.all([
            listMentorshipSessions({ data: { token: mentorToken, batchId: b.id } }).catch(() => ({ sessions: [] })),
            listChatThreads({ data: { token: mentorToken, batchId: b.id } }).catch(() => ({ threads: [] })),
          ]);
          return { batch: b, sessions: s.sessions, threads: t.threads };
        }),
      );

      const scheduled: SessionRow[] = perBatch
        .flatMap((p) => p.sessions.map((s) => ({ ...s, batchName: p.batch.name }) as SessionRow))
        .filter((s) => s.status === "scheduled")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

      const threads: ThreadRow[] = perBatch
        .flatMap((p) => p.threads.map((t) => ({ ...t, batchName: p.batch.name })))
        .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

      setAgenda({
        batchCount: batches.length,
        scheduled,
        threads,
        openTicketCount: tickets.filter((t) => t.status !== "Resolved").length,
        completenessPercent: completeness.percent,
        missing: completeness.missing,
      });
    } catch {
      setAgendaError(true);
    }
  }

  async function loadEarnings() {
    setEarningsError(false);
    try {
      const { overview } = await getMentorEarningsOverview({ data: { token: mentorToken } });
      setEarnings(overview);
    } catch {
      setEarningsError(true);
    }
  }

  useEffect(() => {
    loadAgenda();
    loadEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  const firstName = mentorName.split(" ")[0];

  // Sessions that haven't ended yet — the next one is "live" if it has started.
  const upcoming = useMemo(() => (agenda ? agenda.scheduled.filter((s) => endMs(s) >= now) : []), [agenda, now]);
  const next = upcoming[0] ?? null;
  const needsReply = useMemo(() => (agenda ? agenda.threads.filter((t) => t.lastSender === "student") : []), [agenda]);

  // Earnings derived numbers
  const earningsStats = useMemo(() => {
    if (!earnings) return null;
    const d = new Date(now);
    const thisKey = monthKey(d);
    const prevKey = monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const thisNet = earnings.monthly.find((m) => m.month === thisKey)?.netEarned ?? 0;
    const prevNet = earnings.monthly.find((m) => m.month === prevKey)?.netEarned ?? 0;
    const payers = new Set(earnings.purchases.map((p) => p.studentUid)).size;
    const delta = prevNet > 0 ? Math.round(((thisNet - prevNet) / prevNet) * 100) : null;
    return { thisNet, prevNet, delta, payers };
  }, [earnings, now]);

  // Sessions still to come today (ones that already ended don't count).
  const todayCount = upcoming.filter((s) => sameDay(new Date(s.scheduledAt), new Date(now)) || new Date(s.scheduledAt).getTime() <= now).length;

  if (agendaError) {
    return (
      <div className="space-y-3">
        <ErrorBanner message="Couldn't load your overview. Check your connection, then try again." />
        <button
          type="button"
          onClick={() => {
            setAgenda(null);
            loadAgenda();
          }}
          className="clay-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-xs"
        >
          <Refresh className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      {!agenda ? (
        <div className="ink-section h-60 animate-pulse rounded-3xl opacity-90" aria-label="Loading your day" role="status" />
      ) : (
        <Hero
          data-tour="overview-hero"
          firstName={firstName}
          now={now}
          next={next}
          needsReply={needsReply.length}
          openTickets={agenda.openTicketCount}
          completeness={agenda.completenessPercent}
          missing={agenda.missing}
          onNavigate={onNavigate}
          onTour={tour.start}
        />
      )}

      {/* ── Numbers ──────────────────────────────────────────────── */}
      <div data-tour="overview-stats">
        <StatStrip
          items={[
            {
              label: "Earned this month",
              value: earningsStats ? inr(earningsStats.thisNet) : earningsError ? "—" : null,
              hint: earningsError
                ? "Couldn't load"
                : earningsStats
                  ? earningsStats.delta === null
                    ? earningsStats.thisNet > 0
                      ? "First earnings after a quiet month"
                      : "Net of platform commission"
                    : `${earningsStats.delta >= 0 ? "+" : ""}${earningsStats.delta}% vs last month`
                  : null,
              hintTone: earningsStats?.delta == null ? "muted" : earningsStats.delta >= 0 ? "good" : "warn",
            },
            {
              label: "Lifetime earnings",
              value: earnings ? inr(earnings.totalNetEarned) : earningsError ? "—" : null,
              hint: earnings ? `${earnings.purchases.length} payment${earnings.purchases.length === 1 ? "" : "s"}` : null,
            },
            {
              label: "Active batches",
              value: agenda ? agenda.batchCount : null,
              hint: agenda ? (todayCount > 0 ? `${todayCount} left today` : "Nothing else today") : null,
              onClick: () => onNavigate("scheduler"),
            },
            {
              label: "Paying students",
              value: earningsStats ? earningsStats.payers : earningsError ? "—" : null,
              hint: earnings ? "Across batches and tests" : null,
            },
          ]}
        />
      </div>

      {/* ── Schedule + inbox ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div data-tour="overview-schedule" className="lg:col-span-3">
          <Panel
            icon={CalendarClock}
            title="Coming up"
            className="h-full"
            action={
              <button onClick={() => onNavigate("scheduler")} className="text-xs font-semibold text-[var(--sky-deep)] hover:underline">
                Open batch schedule
              </button>
            }
          >
            {!agenda ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                message="Nothing on the calendar. Schedule a batch meet or a 1:1 and it shows up here."
                action={{ label: "Schedule a session", onClick: () => onNavigate("scheduler") }}
              />
            ) : (
              <Agenda sessions={upcoming.slice(0, 7)} now={now} />
            )}
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel
            icon={MessageSquare}
            title="Student messages"
            className="h-full"
            action={
              <button onClick={() => onNavigate("chat")} className="text-xs font-semibold text-[var(--sky-deep)] hover:underline">
                Open chat desk
              </button>
            }
          >
            {!agenda ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : agenda.threads.length === 0 ? (
              <EmptyState icon={MessageSquare} message="No conversations yet. When a student writes to you, it lands here." />
            ) : (
              <ul className="-mx-2">
                {agenda.threads.slice(0, 5).map((t) => {
                  const waiting = t.lastSender === "student";
                  return (
                    <li key={`${t.batchName}-${t.studentUid}`}>
                      <button
                        type="button"
                        onClick={() => onNavigate("chat")}
                        className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-secondary"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${waiting ? "bg-primary" : "bg-transparent"}`}
                          aria-label={waiting ? "Waiting for your reply" : undefined}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-sm ${waiting ? "font-bold" : "font-semibold"} text-foreground`}>
                              {t.studentName}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-foreground/40">
                              {timeAgo(t.lastMessageAt, now)}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-foreground/55">
                            {!waiting && "You: "}
                            {t.lastMessage}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Earnings ─────────────────────────────────────────────── */}
      <div data-tour="overview-earnings">
        <EarningsPanel earnings={earnings} error={earningsError} onRetry={loadEarnings} />
      </div>

      {/* ── Test series access — only while there's something to do ─ */}
      <TestSeriesAccessNudge mentorToken={mentorToken} />

      {tour.active && <OnboardingTour steps={OVERVIEW_TOUR_STEPS} onFinish={tour.finish} />}
    </div>
  );
}

// ── Hero: the one loud thing on the page ───────────────────────────────
function Hero({
  firstName,
  now,
  next,
  needsReply,
  openTickets,
  completeness,
  missing,
  onNavigate,
  onTour,
  ...rest
}: {
  firstName: string;
  now: number;
  next: SessionRow | null;
  needsReply: number;
  openTickets: number;
  completeness: number;
  missing: string[];
  onNavigate: (key: ModuleKey) => void;
  onTour: () => void;
  "data-tour"?: string;
}) {
  const live = next ? new Date(next.scheduledAt).getTime() <= now : false;
  const TrackIcon = next ? TRACK_ICON[next.track] : CalendarClock;

  type Need = { icon: IconType; title: string; sub?: string; go: ModuleKey };
  const needs: Need[] = [];
  if (needsReply > 0)
    needs.push({
      icon: MessageSquare,
      title: `${needsReply} student${needsReply === 1 ? " is" : "s are"} waiting for a reply`,
      go: "chat",
    });
  if (openTickets > 0)
    needs.push({
      icon: LifeBuoy,
      title: `${openTickets} open ticket${openTickets === 1 ? "" : "s"} with Team Edurack`,
      go: "support",
    });
  if (completeness < 100)
    needs.push({
      icon: Sparkles,
      title: `Profile is ${completeness}% complete`,
      sub: missing.length ? `Missing: ${missing.join(", ")}` : undefined,
      go: "profile",
    });

  return (
    <section data-tour={rest["data-tour"]} className="ink-section rounded-3xl p-5 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
        {/* Left: what's next */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-white/60">
              {greeting(new Date(now).getHours())}, {firstName}
            </p>
            <button
              type="button"
              onClick={onTour}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Tour
            </button>
          </div>

          {next ? (
            <>
              <div className="mt-6 flex items-center gap-2 text-sm font-medium text-white/70">
                {live ? (
                  <>
                    <LiveDot /> Happening now
                  </>
                ) : (
                  "Your next session starts in"
                )}
              </div>
              <p className="mt-1.5 font-display text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl">
                {live ? "Go live" : untilLabel(new Date(next.scheduledAt).getTime() - now)}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
                  <TrackIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{next.batchName}</p>
                  <p className="text-xs text-white/60">
                    {TRACK_LABEL[next.track]} · {dayLabel(next.scheduledAt, now)}, {timeOf(next.scheduledAt)}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {next.meetingLink && (
                  <a
                    href={next.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#141b2b] transition-colors hover:bg-white/90"
                  >
                    <Video className="h-4 w-4" />
                    Join session
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate("scheduler")}
                  className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Open batch schedule
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Nothing scheduled.</p>
              <p className="mt-2 max-w-sm text-sm text-white/60">
                Your calendar is clear. Put a batch meet or a 1:1 on it so students know when to show up.
              </p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => onNavigate("scheduler")}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#141b2b] transition-colors hover:bg-white/90"
                >
                  Schedule a session
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: what needs you */}
        <div className="min-w-0 lg:border-l lg:border-white/10 lg:pl-10">
          <p className="text-sm font-semibold text-white/80">Needs you</p>
          {needs.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-white/5 px-4 py-5">
              <p className="text-sm font-semibold">You’re all caught up.</p>
              <p className="mt-1 text-xs text-white/55">No unanswered students, no open tickets, profile complete.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {needs.map((n) => {
                const Icon = n.icon;
                return (
                  <li key={n.go}>
                    <button
                      type="button"
                      onClick={() => onNavigate(n.go)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-white/70" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{n.title}</span>
                        {n.sub && <span className="block truncate text-xs text-white/50">{n.sub}</span>}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-white/40" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Agenda grouped by day ──────────────────────────────────────────────
function Agenda({ sessions, now }: { sessions: SessionRow[]; now: number }) {
  const groups: { label: string; items: SessionRow[] }[] = [];
  for (const s of sessions) {
    const label = dayLabel(s.scheduledAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(s);
    else groups.push({ label, items: [s] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 text-xs font-semibold text-foreground/50">{g.label}</p>
          <ul className="divide-y divide-border">
            {g.items.map((s) => {
              const Icon = TRACK_ICON[s.track];
              const live = new Date(s.scheduledAt).getTime() <= now;
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {timeOf(s.scheduledAt)}
                  </span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/55">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{s.batchName}</span>
                    <span className="flex items-center gap-1.5 text-xs text-foreground/55">
                      {live && <LiveDot className="scale-75" />}
                      {live ? "Live now · " : ""}
                      {TRACK_LABEL[s.track]}
                      {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                    </span>
                  </span>
                  {s.meetingLink && (
                    <a
                      href={s.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="clay-btn-ghost shrink-0 px-3.5 py-1.5 text-xs text-foreground/75"
                    >
                      Join
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Earnings: 6-month trend + payments feed ────────────────────────────
function EarningsPanel({
  earnings,
  error,
  onRetry,
}: {
  earnings: MentorEarningsOverview | null;
  error: boolean;
  onRetry: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [grown, setGrown] = useState(false);

  // Bars grow in once, when the data first arrives.
  useEffect(() => {
    if (!earnings) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [earnings]);

  const months = useMemo(() => (earnings ? lastMonths(6, earnings.monthly) : []), [earnings]);
  const maxNet = Math.max(...months.map((m) => m.net), 1);
  const peakKey = months.reduce((best, m) => (m.net > (months.find((x) => x.key === best)?.net ?? -1) ? m.key : best), months[0]?.key);

  const payments = useMemo(
    () =>
      earnings
        ? [...earnings.purchases].sort((a, b) => (b.purchasedAt ?? "").localeCompare(a.purchasedAt ?? ""))
        : [],
    [earnings],
  );
  const commission = payments.reduce((sum, p) => sum + p.platformCommission, 0);
  const visible = showAll ? payments : payments.slice(0, 5);

  return (
    <Panel icon={IndianRupee} title="Earnings">
      {error ? (
        <div className="space-y-3">
          <ErrorBanner message="Couldn't load your earnings." />
          <button onClick={onRetry} className="clay-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-xs">
            <Refresh className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : earnings === null ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-48 lg:col-span-3" />
          <Skeleton className="h-48 lg:col-span-2" />
        </div>
      ) : payments.length === 0 ? (
        <EmptyState icon={IndianRupee} message="No payments against your batches or tests yet. Once a student buys, it shows up here." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Trend */}
          <div className="lg:col-span-3">
            <p className="text-xs font-medium text-foreground/55">Net earnings, last 6 months</p>
            <div className="mt-3 flex h-44 items-end gap-2 sm:gap-3">
              {months.map((m, i) => {
                const isCurrent = i === months.length - 1;
                const height = grown ? Math.max(m.net > 0 ? 4 : 2, Math.round((m.net / maxNet) * 70)) : 2;
                const showValue = m.key === peakKey || isCurrent;
                return (
                  <div
                    key={m.key}
                    className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                    role="img"
                    aria-label={`${m.label}: ${inr(m.net)} net from ${m.count} payment${m.count === 1 ? "" : "s"}`}
                  >
                    <span
                      className={`text-[11px] font-semibold tabular-nums transition-opacity ${
                        showValue && m.net > 0 ? "opacity-100 text-foreground" : "opacity-0 text-foreground/70 group-hover:opacity-100"
                      }`}
                    >
                      {inr(m.net)}
                    </span>
                    <div
                      className={`w-full rounded-t-lg transition-[height] duration-700 ease-out ${
                        isCurrent ? "bg-primary" : "bg-primary/25 group-hover:bg-primary/50"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                    <span className={`text-[11px] ${isCurrent ? "font-bold text-foreground" : "text-foreground/50"}`}>
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-xs text-foreground/50">Students paid</dt>
                <dd className="font-bold tabular-nums text-foreground">{inr(earnings.totalGross)}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">Platform commission</dt>
                <dd className="font-bold tabular-nums text-foreground">{inr(commission)}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">You earned</dt>
                <dd className="font-bold tabular-nums text-[var(--sky-deep)]">{inr(earnings.totalNetEarned)}</dd>
              </div>
            </dl>
          </div>

          {/* Payments feed */}
          <div className="lg:col-span-2">
            <p className="text-xs font-medium text-foreground/55">Recent payments</p>
            <ul className={`mt-1 divide-y divide-border ${showAll ? "max-h-96 overflow-y-auto pr-1" : ""}`}>
              {visible.map((p, i) => (
                <li key={`${p.studentUid}-${p.batchId}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{p.studentName}</span>
                    <span className="block truncate text-xs text-foreground/55">
                      {p.source === "test" ? "Test" : "Batch"} · {p.batchName}
                      {p.purchasedAt ? ` · ${new Date(p.purchasedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-foreground">+{inr(p.netEarned)}</span>
                    <span className="block text-[11px] tabular-nums text-foreground/45">of {inr(p.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {payments.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="clay-btn-ghost mt-3 w-full px-4 py-2 text-xs"
              >
                {showAll ? "Show fewer" : `Show all ${payments.length} payments`}
              </button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Test series access: appears only while there's an action or a pending state ──
function TestSeriesAccessNudge({ mentorToken }: { mentorToken: string }) {
  const [status, setStatus] = useState<TestSeriesAccessStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function refresh() {
    try {
      const { status: s } = await getTestSeriesAccessStatus({ data: { token: mentorToken } });
      setStatus(s);
    } catch {
      // Non-essential on the home screen — stay quiet if it fails.
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  async function handleRequest() {
    setRequesting(true);
    setFailed(false);
    try {
      await requestTestSeriesAccess({ data: { token: mentorToken } });
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setRequesting(false);
    }
  }

  // Already approved → the sidebar's "Test series" is the way in; nothing to nudge.
  if (!status || status.hasAccess) return null;

  return (
    <Panel icon={ClipboardList} title="Test series">
      {status.requested ? (
        <div className="flex items-center gap-2 text-sm text-foreground/65">
          <Lock className="h-4 w-4 shrink-0" />
          Your request to sell test series is with the Edurack team. You’ll get access once it’s approved.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-foreground/70">
            Offer your own test series alongside your batch. Request access and Edurack will review it.
          </p>
          <div className="flex items-center gap-3">
            {failed && <span className="text-xs text-foreground/60">Request failed. Try again.</span>}
            <button
              onClick={handleRequest}
              disabled={requesting}
              className="clay-btn inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-70"
            >
              {requesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Request access"}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
