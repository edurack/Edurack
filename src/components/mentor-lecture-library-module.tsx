import { useEffect, useState } from "react";
import {
  Library,
  Eye,
  CheckCircle2,
  MessageSquare,
  Star,
  ChevronDown,
  EyeOff,
  Send,
  Loader2,
  PlayCircle,
  Users2,
  BellRing,
  X,
  Check,
} from "lucide-react";
import {
  listMyLectureLibrary,
  listLectureComments,
  setLectureCommentVisibility,
  postMentorLectureComment,
  listLectureViewersDetail,
  sendLectureWatchAlert,
  listLectureWatchAlerts,
} from "@/server-functions/mentor-portal";
import { ModuleHeader, StatChip, LoadingBlock, EmptyState, ErrorBanner } from "@/components/mentor-portal-ui";

type Lecture = {
  id: string;
  batchId: string;
  batchName: string;
  lectureTitle: string;
  lectureUrl: string;
  scheduledAt: string;
  viewerCount: number;
  completedCount: number;
  commentCount: number;
  avgRating: number | null;
  reviewCount: number;
};

type ViewTab = "viewers" | "comments";

export function MentorLectureLibraryModule({ mentorToken }: { mentorToken: string }) {
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tabBySession, setTabBySession] = useState<Record<string, ViewTab>>({});
  const [alertSessionId, setAlertSessionId] = useState<string | null>(null);

  async function refreshLibrary() {
    const { lectures: rows } = await listMyLectureLibrary({ data: { token: mentorToken } });
    setLectures(rows);
  }

  useEffect(() => {
    refreshLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  function activeTab(sessionId: string): ViewTab {
    return tabBySession[sessionId] ?? "viewers";
  }

  return (
    <div>
      <ModuleHeader
        title="Lecture Library"
        subtitle="Every lecture you've uploaded, with who's watched, ratings, comment moderation, and a way to nudge stragglers."
      />

      {lectures === null ? (
        <LoadingBlock />
      ) : lectures.length === 0 ? (
        <EmptyState icon={PlayCircle} message="You haven't ingested any lectures yet — do that from the Live Sessions tab." />
      ) : (
        <div className="space-y-3">
          {lectures.map((l) => (
            <div key={l.id} className="clay p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="clay-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                    <Library className="h-4 w-4 text-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{l.lectureTitle}</p>
                    <p className="text-xs text-foreground/50">
                      {l.batchName} · Ingested {new Date(l.scheduledAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAlertSessionId(l.id)}
                    className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    Notify students
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                    className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
                  >
                    <Users2 className="h-3.5 w-3.5" />
                    Details
                    <ChevronDown className={`h-3 w-3 transition-transform ${expandedId === l.id ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip icon={Eye} label="Viewers" value={l.viewerCount} />
                <StatChip icon={CheckCircle2} label="Completed" value={l.completedCount} tone={l.completedCount > 0 ? "mint" : "neutral"} />
                <StatChip icon={MessageSquare} label="Comments" value={l.commentCount} />
                <StatChip icon={Star} label="Rating" value={l.avgRating !== null ? `${l.avgRating} (${l.reviewCount})` : "—"} tone="sky" />
              </div>

              {expandedId === l.id && (
                <div className="mt-4">
                  <div className="mb-3 flex gap-1.5">
                    <button
                      onClick={() => setTabBySession((prev) => ({ ...prev, [l.id]: "viewers" }))}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        activeTab(l.id) === "viewers" ? "clay-btn text-white" : "clay-btn-ghost text-foreground/60"
                      }`}
                    >
                      Student progress
                    </button>
                    <button
                      onClick={() => setTabBySession((prev) => ({ ...prev, [l.id]: "comments" }))}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        activeTab(l.id) === "comments" ? "clay-btn text-white" : "clay-btn-ghost text-foreground/60"
                      }`}
                    >
                      Comments ({l.commentCount})
                    </button>
                  </div>

                  {activeTab(l.id) === "viewers" ? (
                    <LectureViewerTable mentorToken={mentorToken} sessionId={l.id} />
                  ) : (
                    <LectureCommentAuditor mentorToken={mentorToken} sessionId={l.id} onCommentPosted={refreshLibrary} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {alertSessionId && (
        <WatchAlertModal
          mentorToken={mentorToken}
          sessionId={alertSessionId}
          lectureTitle={lectures?.find((l) => l.id === alertSessionId)?.lectureTitle ?? "this lecture"}
          onClose={() => setAlertSessionId(null)}
        />
      )}
    </div>
  );
}

// ─── Per-student viewer detail ─────────────────────────────────────────────
type Viewer = { studentUid: string; studentName: string; watchedPercent: number; completed: boolean; rating: number | null };

function LectureViewerTable({ mentorToken, sessionId }: { mentorToken: string; sessionId: string }) {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);

  useEffect(() => {
    (async () => {
      const { viewers: rows } = await listLectureViewersDetail({ data: { token: mentorToken, sessionId } });
      setViewers(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (viewers === null) return <LoadingBlock compact />;
  if (viewers.length === 0) return <EmptyState icon={Eye} message="No student has opened this lecture yet." />;

  return (
    <div className="clay-inset overflow-hidden rounded-2xl">
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-[var(--sky-soft)]/40 text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
            <tr>
              <th className="px-4 py-2.5">Student</th>
              <th className="px-4 py-2.5">Watched</th>
              <th className="px-4 py-2.5">Completed</th>
              <th className="px-4 py-2.5">Rating</th>
            </tr>
          </thead>
          <tbody>
            {viewers.map((v) => (
              <tr key={v.studentUid} className="border-t border-foreground/5">
                <td className="px-4 py-2.5 font-medium text-foreground">{v.studentName}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-[var(--sky-deep)]"
                        style={{ width: `${Math.min(100, v.watchedPercent)}%` }}
                      />
                    </div>
                    <span className="text-xs text-foreground/60">{v.watchedPercent}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {v.completed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/70">
                      <Check className="h-3.5 w-3.5 text-[var(--sky-deep)]" /> Yes
                    </span>
                  ) : (
                    <span className="text-xs text-foreground/40">In progress</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {v.rating !== null ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/70">
                      <Star className="h-3.5 w-3.5 fill-[var(--sky-deep)] text-[var(--sky-deep)]" /> {v.rating}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── "Notify students to watch" alert ──────────────────────────────────────
function WatchAlertModal({
  mentorToken,
  sessionId,
  lectureTitle,
  onClose,
}: {
  mentorToken: string;
  sessionId: string;
  lectureTitle: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(`Don't forget to watch "${lectureTitle}" — it's important for your prep!`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [history, setHistory] = useState<{ id: string; message: string; recipientCount: number; createdAt: string | null }[] | null>(null);

  useEffect(() => {
    (async () => {
      const { alerts } = await listLectureWatchAlerts({ data: { token: mentorToken, sessionId } });
      setHistory(alerts);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleSend() {
    setError(null);
    if (!message.trim()) return setError("Write a short alert message.");
    setSending(true);
    try {
      const { alert } = await sendLectureWatchAlert({ data: { token: mentorToken, sessionId, message } });
      setSentCount(alert.recipientCount);
      setHistory((prev) => [alert, ...(prev ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="clay w-full max-w-md p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
            <BellRing className="h-4 w-4" /> Notify students
          </h3>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-foreground/50">
          Sends an in-app nudge to every student who's purchased this batch, pointing them at "{lectureTitle}".
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="clay-inset mb-3 w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground focus:outline-none"
        />

        {error && (
          <div className="mb-3">
            <ErrorBanner message={error} />
          </div>
        )}

        {sentCount !== null && (
          <p className="mb-3 rounded-2xl bg-[var(--mint-soft)]/60 px-4 py-2.5 text-xs font-medium text-foreground">
            Sent to {sentCount} student{sentCount === 1 ? "" : "s"}.
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="clay-btn mb-4 flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send alert"}
        </button>

        {history !== null && history.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Previously sent</p>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="clay-inset px-3.5 py-2 text-xs text-foreground/70">
                  <p className="truncate">{h.message}</p>
                  <p className="mt-0.5 text-[10px] text-foreground/40">
                    {h.recipientCount} recipient{h.recipientCount === 1 ? "" : "s"}
                    {h.createdAt ? ` · ${new Date(h.createdAt).toLocaleString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comment auditor (unchanged from before) ───────────────────────────────
type Comment = { id: string; studentName: string; body: string; hidden: boolean; createdAt: string | null };

function LectureCommentAuditor({
  mentorToken,
  sessionId,
  onCommentPosted,
}: {
  mentorToken: string;
  sessionId: string;
  onCommentPosted: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
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

  async function toggle(commentId: string, hidden: boolean) {
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
      onCommentPosted();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
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

      <div className="clay-inset max-h-72 space-y-2 overflow-y-auto rounded-2xl p-4">
        {comments === null ? (
          <LoadingBlock compact />
        ) : comments.length === 0 ? (
          <p className="text-xs text-foreground/50">No comments on this lecture yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={`clay flex items-start justify-between gap-3 px-3.5 py-2.5 ${c.hidden ? "opacity-50" : ""}`}>
              <div>
                <p className="text-xs font-semibold text-foreground">{c.studentName}</p>
                <p className="text-xs text-foreground/70">{c.body}</p>
              </div>
              <button
                onClick={() => toggle(c.id, c.hidden)}
                className="shrink-0 text-foreground/40 hover:text-foreground/70"
                aria-label={c.hidden ? "Unhide" : "Hide"}
              >
                {c.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}