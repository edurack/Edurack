import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  Users2,
  Video,
  PlayCircle,
  CalendarClock,
  MessageSquare,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Link2,
  Plus,
  X,
  Send,
} from "lucide-react";
import type { MentorshipSession, LectureComment } from "@/lib/admin-types";
import {
  listMyAssignedBatches,
  listBatchStudents,
  getStudentSessionUsage,
  createMentorshipSession,
  listMentorshipSessions,
  updateSessionStatus,
  listLectureComments,
  setLectureCommentVisibility,
  postMentorLectureComment,
} from "@/server-functions/mentor-portal";
import {
  ModuleHeader,
  ClayField,
  Panel,
  LoadingBlock,
  EmptyState,
  ErrorBanner,
  inputClass,
  LectureUploadField,
} from "@/components/mentor-portal-ui";

type Batch = { id: string; name: string; track: string };
type TabKey = "OneOnOne" | "BatchMeet" | "AsyncLecture";

const TABS: { key: TabKey; label: string; icon: typeof Users2 }[] = [
  { key: "OneOnOne", label: "1:1 Mentorship", icon: Users2 },
  { key: "BatchMeet", label: "Batch Meet", icon: Video },
  { key: "AsyncLecture", label: "Lecture Hub", icon: PlayCircle },
];

export function MentorSchedulerModule({ mentorToken }: { mentorToken: string }) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState("");
  const [tab, setTab] = useState<TabKey>("OneOnOne");

  useEffect(() => {
    (async () => {
      const { batches: rows } = await listMyAssignedBatches({ data: { token: mentorToken } });
      setBatches(rows);
      if (rows.length > 0) setBatchId(rows[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  return (
    <div>
      <ModuleHeader
        title="Smart Live Session Scheduler"
        subtitle="Run 1:1 mentorship, batch meets, and async lecture ingestion — all scoped to your assigned batch."
      />

      {batches === null ? (
        <LoadingBlock />
      ) : batches.length === 0 ? (
        <EmptyState icon={CalendarClock} message="No mentorship batches are assigned to you yet." />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <ClayField label="Batch">
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className={inputClass + " appearance-none"}
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.track}
                    </option>
                  ))}
                </select>
              </ClayField>
            </div>
            <div className="clay-inset flex gap-1 p-1 sm:w-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold transition-all sm:flex-none sm:px-4 ${
                      tab === t.key ? "clay-btn text-white" : "text-foreground/70 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {batchId && tab === "OneOnOne" && <TrackOneOnOne mentorToken={mentorToken} batchId={batchId} />}
          {batchId && tab === "BatchMeet" && <TrackBatchMeet mentorToken={mentorToken} batchId={batchId} />}
          {batchId && tab === "AsyncLecture" && <TrackAsyncLecture mentorToken={mentorToken} batchId={batchId} />}
        </>
      )}
    </div>
  );
}

// ─── Track A: 1:1 Personal Mentorship ─────────────────────────────────────
type Student = { uid: string; fullName: string; email: string | null };

function TrackOneOnOne({ mentorToken, batchId }: { mentorToken: string; batchId: string }) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [studentUid, setStudentUid] = useState("");
  const [usage, setUsage] = useState<{ sessionsUsed: number; sessionsRemaining: number } | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [meetingLink, setMeetingLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sessions, setSessions] = useState<MentorshipSession[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      const { students: rows } = await listBatchStudents({ data: { token: mentorToken, batchId } });
      setStudents(rows);
      if (rows.length > 0) setStudentUid(rows[0].uid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function refreshUsage(uid: string) {
    if (!uid) return;
    const { usage: u } = await getStudentSessionUsage({ data: { token: mentorToken, batchId, studentUid: uid } });
    setUsage(u);
  }

  async function refreshSessions() {
    const { sessions: rows } = await listMentorshipSessions({
      data: { token: mentorToken, batchId, track: "OneOnOne" },
    });
    setSessions(rows);
  }

  useEffect(() => {
    if (studentUid) refreshUsage(studentUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUid]);

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentUid) return setError("Select a student.");
    const minutes = Number(durationMinutes);
    if (!minutes || minutes <= 0 || minutes > 180) return setError("Duration must be between 1 and 180 minutes.");
    if (!meetingLink.trim()) return setError("Provide a meeting link.");
    if (!scheduledAt) return setError("Set a scheduled date/time.");
    if (usage && usage.sessionsRemaining <= 0) {
      return setError("This student has used all 20 allotted 1:1 sessions in this batch.");
    }

    setSaving(true);
    try {
      await createMentorshipSession({
        data: {
          token: mentorToken,
          session: { batchId, track: "OneOnOne", studentUid, durationMinutes: minutes, meetingLink: meetingLink.trim(), scheduledAt },
        },
      });
      setMeetingLink("");
      setScheduledAt("");
      setShowForm(false);
      await Promise.all([refreshUsage(studentUid), refreshSessions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule this session.");
    } finally {
      setSaving(false);
    }
  }

  async function markStatus(sessionId: string, status: "completed" | "cancelled") {
    await updateSessionStatus({ data: { token: mentorToken, sessionId, status } });
    await refreshSessions();
    if (studentUid) await refreshUsage(studentUid);
  }

  const studentName = students?.find((s) => s.uid === studentUid)?.fullName ?? "";

  return (
    <div className="space-y-6">
      {showForm && (
        <Panel
          icon={Users2}
          title="Schedule a 1:1 session"
          action={
            <button onClick={() => setShowForm(false)} className="text-foreground/40 hover:text-foreground/70">
              <X className="h-4 w-4" />
            </button>
          }
        >
          {students === null ? (
            <LoadingBlock compact />
          ) : students.length === 0 ? (
            <EmptyState message="No students have purchased this batch yet." />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <ClayField label="Student">
                <select
                  value={studentUid}
                  onChange={(e) => setStudentUid(e.target.value)}
                  className={inputClass + " appearance-none"}
                >
                  {students.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </ClayField>

              {usage && (
                <div
                  className={`clay-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
                    usage.sessionsRemaining === 0 ? "text-[var(--destructive)]" : "text-foreground/70"
                  }`}
                >
                  {usage.sessionsUsed}/20 sessions used for {studentName} · {usage.sessionsRemaining} remaining
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ClayField label="Duration (minutes, max 180)">
                  <input
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    inputMode="numeric"
                    placeholder="30"
                    className={inputClass}
                  />
                </ClayField>
                <ClayField label="Scheduled date/time">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className={inputClass}
                  />
                </ClayField>
              </div>

              <ClayField label="Meeting link">
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
                  <input
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/…"
                    className={inputClass + " pl-10"}
                  />
                </div>
              </ClayField>

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={saving || (usage?.sessionsRemaining ?? 1) <= 0}
                className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Schedule session"}
              </button>
            </form>
          )}
        </Panel>
      )}

      <SessionList
        sessions={sessions}
        onMarkStatus={markStatus}
        action={
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
            >
              <Plus className="h-3.5 w-3.5" /> New session
            </button>
          )
        }
      />
    </div>
  );
}

// ─── Track B: Complete Batch Meet ─────────────────────────────────────────
function TrackBatchMeet({ mentorToken, batchId }: { mentorToken: string; batchId: string }) {
  const [meetingLink, setMeetingLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sessions, setSessions] = useState<MentorshipSession[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refreshSessions() {
    const { sessions: rows } = await listMentorshipSessions({ data: { token: mentorToken, batchId, track: "BatchMeet" } });
    setSessions(rows);
  }

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!meetingLink.trim()) return setError("Provide a meeting link.");
    if (!scheduledAt) return setError("Set a scheduled date/time.");

    setSaving(true);
    try {
      await createMentorshipSession({
        data: { token: mentorToken, session: { batchId, track: "BatchMeet", meetingLink: meetingLink.trim(), scheduledAt } },
      });
      setMeetingLink("");
      setScheduledAt("");
      setShowForm(false);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the batch meet.");
    } finally {
      setSaving(false);
    }
  }

  async function markStatus(sessionId: string, status: "completed" | "cancelled") {
    await updateSessionStatus({ data: { token: mentorToken, sessionId, status } });
    await refreshSessions();
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <Panel
          icon={Video}
          title="Broadcast a batch meet room"
          action={
            <button onClick={() => setShowForm(false)} className="text-foreground/40 hover:text-foreground/70">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <ClayField label="Live video room link">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
                <input
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/…"
                  className={inputClass + " pl-10"}
                />
              </div>
            </ClayField>
            <ClayField label="Scheduled date/time">
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
            </ClayField>

            {error && <ErrorBanner message={error} />}

            <button
              type="submit"
              disabled={saving}
              className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Push to all students in batch"}
            </button>
          </form>
        </Panel>
      )}

      <SessionList
        sessions={sessions}
        onMarkStatus={markStatus}
        action={
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
            >
              <Plus className="h-3.5 w-3.5" /> New batch meet
            </button>
          )
        }
      />
    </div>
  );
}

// ─── Track C: Async Lecture Ingestion + Comment Auditor ──────────────────
function TrackAsyncLecture({ mentorToken, batchId }: { mentorToken: string; batchId: string }) {
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureUrl, setLectureUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sessions, setSessions] = useState<MentorshipSession[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLectureId, setActiveLectureId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refreshSessions() {
    const { sessions: rows } = await listMentorshipSessions({ data: { token: mentorToken, batchId, track: "AsyncLecture" } });
    setSessions(rows);
  }

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!lectureTitle.trim()) return setError("Give this lecture a title.");
    if (!lectureUrl.trim()) return setError("Upload the lecture video first.");
    if (!scheduledAt) return setError("Set when this lecture becomes available.");

    setSaving(true);
    try {
      await createMentorshipSession({
        data: {
          token: mentorToken,
          session: { batchId, track: "AsyncLecture", lectureTitle: lectureTitle.trim(), lectureUrl: lectureUrl.trim(), scheduledAt },
        },
      });
      setLectureTitle("");
      setLectureUrl("");
      setScheduledAt("");
      setShowForm(false);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ingest this lecture.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <Panel
          icon={PlayCircle}
          title="Upload a lecture"
          action={
            <button onClick={() => setShowForm(false)} className="text-foreground/40 hover:text-foreground/70">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <ClayField label="Lecture title">
              <input
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
                placeholder="e.g. Thermodynamics — Session 4"
                className={inputClass}
              />
            </ClayField>
            <LectureUploadField
              label="Lecture video"
              value={lectureUrl}
              onChange={setLectureUrl}
              storagePath={`lectures/${batchId}`}
            />
            <ClayField label="Available from">
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
            </ClayField>

            {error && <ErrorBanner message={error} />}

            <button
              type="submit"
              disabled={saving}
              className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ingest lecture"}
            </button>
          </form>
        </Panel>
      )}

      <Panel
        icon={CalendarClock}
        title="Ingested lectures"
        action={
          !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
            >
              <Plus className="h-3.5 w-3.5" /> New lecture
            </button>
          )
        }
      >
        {sessions === null ? (
          <LoadingBlock compact />
        ) : sessions.length === 0 ? (
          <EmptyState icon={PlayCircle} message="No lectures ingested yet." />
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="clay-inset px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.lectureTitle}</p>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      Available from {new Date(s.scheduledAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveLectureId(activeLectureId === s.id ? null : s.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {activeLectureId === s.id ? "Hide comments" : "Moderate comments"}
                  </button>
                </div>
                {activeLectureId === s.id && <CommentAuditor mentorToken={mentorToken} sessionId={s.id} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ─── Shared: session status list ──────────────────────────────────────────
function SessionList({
  sessions,
  onMarkStatus,
  action,
}: {
  sessions: MentorshipSession[] | null;
  onMarkStatus: (sessionId: string, status: "completed" | "cancelled") => void;
  action?: React.ReactNode;
}) {
  return (
    <Panel icon={CalendarClock} title="Scheduled sessions" action={action}>
      {sessions === null ? (
        <LoadingBlock compact />
      ) : sessions.length === 0 ? (
        <EmptyState icon={CalendarClock} message="Nothing scheduled yet." />
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {new Date(s.scheduledAt).toLocaleString()}
                  {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                </p>
                {s.meetingLink && (
                  <a href={s.meetingLink} target="_blank" rel="noreferrer" className="truncate text-xs text-[var(--sky-deep)] hover:underline">
                    {s.meetingLink}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    s.status === "completed"
                      ? "bg-[var(--mint-soft)]/60 text-foreground"
                      : s.status === "cancelled"
                        ? "bg-[var(--coral-soft)]/50 text-foreground"
                        : "bg-foreground/5 text-foreground/50"
                  }`}
                >
                  {s.status}
                </span>
                {s.status === "scheduled" && (
                  <>
                    <button onClick={() => onMarkStatus(s.id, "completed")} className="text-foreground/40 hover:text-[var(--mint-soft)]" aria-label="Mark completed">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => onMarkStatus(s.id, "cancelled")} className="text-foreground/40 hover:text-[var(--destructive)]" aria-label="Cancel">
                      <XCircle className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Comment auditor (pinned per-lecture) ─────────────────────────────────
function CommentAuditor({ mentorToken, sessionId }: { mentorToken: string; sessionId: string }) {
  const [comments, setComments] = useState<LectureComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  async function refresh() {
    const { comments: rows } = await listLectureComments({ data: { token: mentorToken, sessionId } });
    setComments(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function toggleVisibility(commentId: string, hidden: boolean) {
    await setLectureCommentVisibility({ data: { token: mentorToken, commentId, hidden: !hidden } });
    await refresh();
  }

  async function postAsMentor() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await postMentorLectureComment({ data: { token: mentorToken, sessionId, body: draft.trim() } });
      setDraft("");
      await refresh();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="clay mt-3 p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && postAsMentor()}
          placeholder="Pin a note for every student watching this lecture…"
          className="clay-inset flex-1 rounded-2xl px-3.5 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        <button
          onClick={postAsMentor}
          disabled={posting || !draft.trim()}
          className="clay-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-70"
          aria-label="Post pinned comment"
        >
          {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>

      {comments === null ? (
        <LoadingBlock compact />
      ) : comments.length === 0 ? (
        <p className="text-xs text-foreground/50">No student comments on this lecture yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className={`clay-inset flex items-start justify-between gap-3 px-3.5 py-2.5 ${c.hidden ? "opacity-50" : ""}`}>
              <div>
                <p className="text-xs font-semibold text-foreground">{c.studentName}</p>
                <p className="text-xs text-foreground/70">{c.body}</p>
              </div>
              <button
                onClick={() => toggleVisibility(c.id, c.hidden)}
                className="shrink-0 text-foreground/40 hover:text-foreground/70"
                aria-label={c.hidden ? "Unhide comment" : "Hide comment"}
              >
                {c.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}