// The mentor portal previously had no home screen at all — it landed
// straight on Profile Control, an editing form, as if that were the most
// useful thing to see on login. This aggregates what already exists across
// listMyAssignedBatches / listMentorshipSessions / listChatThreads /
// listMyMentorTickets / getMentorProfileCompleteness — no new server
// functions were needed, this is purely client-side composition of data
// that was already there but never surfaced together.
import { useEffect, useState } from "react";
import {
  CalendarClock,
  MessageSquare,
  LifeBuoy,
  Layers3,
  ArrowRight,
  Sparkles,
  Video,
  Users2,
  PlayCircle,
} from "lucide-react";
import {
  listMyAssignedBatches,
  listMentorshipSessions,
  listChatThreads,
  listMyMentorTickets,
} from "@/server-functions/mentor-portal";
import { getMentorProfileCompleteness } from "@/server-functions/mentor-auth";
import { ModuleHeader, Panel, StatChip, LoadingBlock, EmptyState } from "@/components/mentor-portal-ui";

type ModuleKey = "overview" | "profile" | "announcements" | "scheduler" | "chat" | "support" | "library";

type SessionRow = {
  id: string;
  batchId: string;
  batchName: string;
  track: "OneOnOne" | "BatchMeet" | "AsyncLecture";
  scheduledAt: string;
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

type OverviewData = {
  batchCount: number;
  todaysSessions: SessionRow[];
  upcomingSessions: SessionRow[];
  recentThreads: ThreadRow[];
  openTicketCount: number;
  completenessPercent: number;
  missing: string[];
};

function isSameDay(iso: string, ref: Date) {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

const TRACK_ICON = { OneOnOne: Users2, BatchMeet: Video, AsyncLecture: PlayCircle } as const;
const TRACK_LABEL = { OneOnOne: "1:1", BatchMeet: "Batch meet", AsyncLecture: "Lecture" } as const;

export function MentorOverviewModule({
  mentorToken,
  mentorName,
  onNavigate,
}: {
  mentorToken: string;
  mentorName: string;
  onNavigate: (key: ModuleKey) => void;
}) {
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    (async () => {
      const [{ batches }, completeness, { tickets }] = await Promise.all([
        listMyAssignedBatches({ data: { token: mentorToken } }),
        getMentorProfileCompleteness({ data: { token: mentorToken } }),
        listMyMentorTickets({ data: { token: mentorToken } }),
      ]);

      const perBatch = await Promise.all(
        batches.map(async (b) => {
          const [{ sessions }, { threads }] = await Promise.all([
            listMentorshipSessions({ data: { token: mentorToken, batchId: b.id } }),
            listChatThreads({ data: { token: mentorToken, batchId: b.id } }),
          ]);
          return { batch: b, sessions, threads };
        }),
      );

      const now = new Date();
      const allSessions: SessionRow[] = perBatch.flatMap((p) =>
        p.sessions.map((s) => ({ ...s, batchName: p.batch.name })),
      );
      const scheduled = allSessions.filter((s) => s.status === "scheduled");
      const todaysSessions = scheduled
        .filter((s) => isSameDay(s.scheduledAt, now))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      const upcomingSessions = scheduled
        .filter((s) => new Date(s.scheduledAt) > now && !isSameDay(s.scheduledAt, now))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 5);

      const allThreads: ThreadRow[] = perBatch.flatMap((p) =>
        p.threads.map((t) => ({ ...t, batchName: p.batch.name })),
      );
      const recentThreads = [...allThreads]
        .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
        .slice(0, 5);

      setData({
        batchCount: batches.length,
        todaysSessions,
        upcomingSessions,
        recentThreads,
        openTicketCount: tickets.filter((t) => t.status !== "Resolved").length,
        completenessPercent: completeness.percent,
        missing: completeness.missing,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  return (
    <div>
      <ModuleHeader title={`Welcome back, ${mentorName.split(" ")[0]}`} subtitle="Here's what's happening across your batches." />

      {!data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          {/* ── Top-line stats ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip icon={Layers3} label="Assigned batches" value={data.batchCount} tone="sky" />
            <StatChip
              icon={CalendarClock}
              label="Today's sessions"
              value={data.todaysSessions.length}
              tone={data.todaysSessions.length > 0 ? "mint" : "neutral"}
            />
            <StatChip
              icon={LifeBuoy}
              label="Open tickets"
              value={data.openTicketCount}
              tone={data.openTicketCount > 0 ? "coral" : "neutral"}
            />
            <StatChip
              icon={Sparkles}
              label="Profile complete"
              value={`${data.completenessPercent}%`}
              tone={data.completenessPercent === 100 ? "mint" : "coral"}
            />
          </div>

          {/* ── Profile completeness nudge — only shown if incomplete ── */}
          {data.completenessPercent < 100 && (
            <div className="clay-inset flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--coral-soft)]/30 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Your profile isn't complete yet</p>
                <p className="mt-0.5 text-xs text-foreground/60">
                  Missing: {data.missing.join(", ")}
                </p>
              </div>
              <button
                onClick={() => onNavigate("profile")}
                className="clay-btn inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
              >
                Complete it <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ── Today / upcoming sessions ────────────────────────── */}
            <Panel
              icon={CalendarClock}
              title="Schedule"
              action={
                <button
                  onClick={() => onNavigate("scheduler")}
                  className="text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                >
                  Open scheduler
                </button>
              }
            >
              {data.todaysSessions.length === 0 && data.upcomingSessions.length === 0 ? (
                <EmptyState icon={CalendarClock} message="Nothing scheduled. Set something up from Live Sessions." />
              ) : (
                <div className="space-y-4">
                  {data.todaysSessions.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                        Today
                      </p>
                      <ul className="space-y-1.5">
                        {data.todaysSessions.map((s) => (
                          <SessionRowItem key={s.id} session={s} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.upcomingSessions.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                        Upcoming
                      </p>
                      <ul className="space-y-1.5">
                        {data.upcomingSessions.map((s) => (
                          <SessionRowItem key={s.id} session={s} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {/* ── Recent messages ───────────────────────────────────── */}
            <Panel
              icon={MessageSquare}
              title="Recent messages"
              action={
                <button
                  onClick={() => onNavigate("chat")}
                  className="text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                >
                  Open chat desk
                </button>
              }
            >
              {data.recentThreads.length === 0 ? (
                <EmptyState icon={MessageSquare} message="No conversations yet." />
              ) : (
                <ul className="space-y-1.5">
                  {data.recentThreads.map((t) => (
                    <li key={`${t.batchName}-${t.studentUid}`} className="clay-inset px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{t.studentName}</p>
                        <span className="shrink-0 text-[10px] text-foreground/40">{t.batchName}</span>
                      </div>
                      <p className="truncate text-xs text-foreground/50">
                        {t.lastSender === "mentor" ? "You: " : ""}
                        {t.lastMessage}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* ── Quick actions ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction icon={LifeBuoy} label="Help Desk" onClick={() => onNavigate("support")} />
            <QuickAction icon={PlayCircle} label="Lecture Library" onClick={() => onNavigate("library")} />
            <QuickAction icon={MessageSquare} label="Announcements" onClick={() => onNavigate("announcements")} />
            <QuickAction icon={Sparkles} label="Profile" onClick={() => onNavigate("profile")} />
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRowItem({ session }: { session: SessionRow }) {
  const Icon = TRACK_ICON[session.track];
  return (
    <li className="clay-inset flex items-center gap-3 px-3.5 py-2.5">
      <div className="clay flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-3.5 w-3.5 text-foreground/50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{session.batchName}</p>
        <p className="text-xs text-foreground/50">
          {TRACK_LABEL[session.track]} ·{" "}
          {new Date(session.scheduledAt).toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
      {session.meetingLink && (
        <a
          href={session.meetingLink}
          target="_blank"
          rel="noreferrer"
          className="clay-btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/70"
        >
          Join
        </a>
      )}
    </li>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof CalendarClock;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="clay flex flex-col items-center gap-2 p-4 text-center transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="clay-inset flex h-9 w-9 items-center justify-center rounded-2xl">
        <Icon className="h-4 w-4 text-foreground/60" />
      </div>
      <span className="text-xs font-semibold text-foreground/80">{label}</span>
    </button>
  );
}