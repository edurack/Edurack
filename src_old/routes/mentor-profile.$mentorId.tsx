import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconLoader2 as Loader2, IconArrowLeft as ArrowLeft, IconMessageCircle as MessageSquare, IconSend as Send, IconFileText as FileText, IconStar as StarIcon, IconCircleCheck as CheckCircle2, IconRosetteDiscountCheck as BadgeCheck, IconUsersGroup as Users2, IconClock as Clock, IconPlayerPlayFilled as PlayCircle } from "@tabler/icons-react";
import { User2 } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { VideoPlayer } from "@/components/clay-video-player";
import { ClayStarRating } from "@/components/clay-star-rating";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import {
  getLectureSessionForStudent,
  listLectureCommentsForStudent,
  postLectureCommentAsStudent,
  updateLectureProgress,
  getMyLectureProgress,
  submitSessionReview,
  getMySessionReview,
  listMentorNotesForStudent,
} from "@/server-functions/batch-hub";

export const Route = createFileRoute("/mentor-profile/$mentorId")({
  component: LecturePage,
});

type LectureSession = {
  id: string;
  batchId: string;
  batchName: string;
  mentorName: string | null;
  lectureTitle: string;
  lectureUrl: string;
  scheduledAt: string;
};

type Comment = {
  id: string;
  isMentor: boolean;
  mentorId: string | null;
  studentUid: string | null;
  studentName: string;
  profilePictureUrl: string | null;
  body: string;
  isOwn: boolean;
  hidden: boolean;
  createdAt: string | null;
};

type NoteRow = { id: string; fileName: string; fileUrl: string; watermarkApplied: boolean };

function LecturePage() {
  const { sessionId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<LectureSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [initialTime, setInitialTime] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [pdfModal, setPdfModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function refreshComments(token: string) {
    const { comments: rows } = await listLectureCommentsForStudent({ data: { token, sessionId } });
    setComments(rows as Comment[]);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      try {
        const { session: s } = await getLectureSessionForStudent({ data: { token, sessionId } });
        setSession(s);

        const [{ progress }, { notes: n }] = await Promise.all([
          getMyLectureProgress({ data: { token, sessionId } }),
          listMentorNotesForStudent({ data: { token, batchId: s.batchId } }),
        ]);
        if (progress) {
          setInitialTime(progress.watchedSeconds);
          setCompleted(progress.completed);
        }
        setNotes(n);
        await refreshComments(token);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load this lecture.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionId]);

  async function handleProgress(currentTime: number, duration: number) {
    if (!user) return;
    const token = await user.getIdToken();
    const result = await updateLectureProgress({
      data: { token, sessionId, watchedSeconds: currentTime, durationSeconds: duration },
    });
    if (result.completed) setCompleted(true);
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">

      <AppHeader user={user} />

      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <button
          onClick={() =>
            session
              ? navigate({ to: "/course/$kind/$id", params: { kind: "mentorship", id: session.batchId } })
              : navigate({ to: "/dashboard" })
          }
          className="group mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to batch
        </button>

        {loadError ? (
          <div className="clay animate-in fade-in p-10 text-center duration-300">
            <div className="clay-inset mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl">
              <PlayCircle className="h-6 w-6 text-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground/70">{loadError}</p>
          </div>
        ) : !session ? (
          <LecturePageSkeleton />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-1 gap-5 duration-300 sm:gap-6 lg:grid-cols-3">
            {/* ── Left: video, meta, notes, rating ─────────────────────── */}
            <div className="space-y-5 sm:space-y-6 lg:col-span-2">
              <div className="clay overflow-hidden p-2 sm:p-3">
                <div className="overflow-hidden rounded-2xl">
                  <VideoPlayer
                    src={session.lectureUrl}
                    initialTime={initialTime}
                    onProgress={handleProgress}
                    onEnded={() => setCompleted(true)}
                  />
                </div>
              </div>

              <div className="clay p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      {session.lectureTitle}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-foreground/60 sm:text-sm">
                      <span className="clay-chip inline-flex items-center gap-1.5 px-2.5 py-1">
                        <Users2 className="h-3.5 w-3.5 text-foreground/40" />
                        {session.batchName}
                      </span>
                      {session.mentorName && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/70">
                          <span className="h-1 w-1 rounded-full bg-foreground/30" />
                          {session.mentorName}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`clay-chip inline-flex shrink-0 items-center gap-1.5 bg-[var(--mint-soft)]/50 px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                      completed ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--sky-deep)]" />
                    Watched
                  </span>
                </div>
              </div>

              {notes && notes.length > 0 && (
                <div className="clay p-5 sm:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="clay-inset flex h-7 w-7 items-center justify-center rounded-xl">
                      <FileText className="h-3.5 w-3.5 text-foreground/60" />
                    </div>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60 sm:text-sm">
                      Notes for this batch
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {notes.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setPdfModal({ url: n.fileUrl, name: n.fileName })}
                        className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 hover:border-primary/60 hover:bg-foreground/5"
                      >
                        <div className="clay flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                          <FileText className="h-4 w-4 text-[var(--sky-deep)]" />
                        </div>
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">{n.fileName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <RatingPanel sessionId={sessionId} batchId={session.batchId} />
            </div>

            {/* ── Right: locked-height discussion panel ─────────────────── */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-20">
                <DiscussionPanel
                  sessionId={sessionId}
                  comments={comments}
                  onRefresh={() => user.getIdToken().then(refreshComments)}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {pdfModal && <PdfPreviewModal url={pdfModal.url} name={pdfModal.name} onClose={() => setPdfModal(null)} />}
    </div>
  );
}

// ─── Loading skeleton — mirrors the final layout's shape so the page
// doesn't visually "jump" once real content arrives. ───────────────────────
function LecturePageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-3">
      <div className="space-y-5 sm:space-y-6 lg:col-span-2">
        <div className="clay aspect-video w-full animate-pulse bg-foreground/5 p-2 sm:p-3" />
        <div className="clay h-24 animate-pulse bg-foreground/5 p-5 sm:p-6" />
      </div>
      <div className="clay h-[28rem] animate-pulse bg-foreground/5 lg:col-span-1" />
    </div>
  );
}

// ─── Rating panel ────────────────────────────────────────────────────────────
function RatingPanel({ sessionId, batchId }: { sessionId: string; batchId: string }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const { review } = await getMySessionReview({ data: { token, sessionId } });
      if (review) {
        setRating(review.rating);
        setReviewText(review.reviewText);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleSave() {
    if (!user || rating === 0) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      await submitSessionReview({ data: { token, sessionId, batchId, rating, reviewText } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clay p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="clay-inset flex h-7 w-7 items-center justify-center rounded-xl">
          <StarIcon className="h-3.5 w-3.5 text-foreground/60" />
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60 sm:text-sm">
          Rate this lecture
        </h2>
      </div>
      <ClayStarRating value={rating} onChange={setRating} size="lg" />
      <textarea
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        placeholder="Optional — what worked, what could be clearer…"
        rows={3}
        className="clay-inset mt-4 w-full resize-none rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
      />
      <button
        onClick={handleSave}
        disabled={rating === 0 || saving}
        className="clay-btn mt-4 flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 sm:w-auto"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? "Saved!" : "Save rating"}
      </button>
    </div>
  );
}

// ─── Discussion panel — height-locked with its own internal scroll ─────────
// Mentor comments (isMentor: true) are always sorted to the top server-side
// (see listLectureCommentsForStudent) and rendered with a distinct pinned
// style: verified badge, tinted background, and the mentor's name links to
// their full public profile page.
//
// SCROLL FIX: previously this auto-scrolled via bottomRef.scrollIntoView(),
// which doesn't just scroll this inner box — it can scroll the *whole
// page* to bring that ref into view, since the panel sits low in a
// two-column layout. That's what was causing the page to jump to the
// bottom on every load. Now we scroll the container's own scrollTop
// directly (never touches page scroll), and skip the auto-scroll
// entirely on the very first load — it only kicks in for genuinely new
// comments after that.
function DiscussionPanel({
  sessionId,
  comments,
  onRefresh,
}: {
  sessionId: string;
  comments: Comment[] | null;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!comments) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    if (!hasLoadedOnce.current) {
      // First load: snap to bottom instantly, and only within this box —
      // never scroll the outer page.
      hasLoadedOnce.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }

    // Subsequent updates (new comment arrives): scroll smoothly, still
    // scoped to this container only.
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [comments]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.trim() || !user) return;

    setSending(true);
    try {
      const token = await user.getIdToken();
      await postLectureCommentAsStudent({ data: { token, sessionId, body: draft.trim() } });
      setDraft("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post your comment. Try again.");
    } finally {
      setSending(false);
    }
  }

  const commentCount = comments?.length ?? 0;

  return (
    <div className="clay flex h-[26rem] flex-col overflow-hidden sm:h-[32rem]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-foreground/10 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <div className="clay-inset flex h-7 w-7 items-center justify-center rounded-xl">
            <MessageSquare className="h-3.5 w-3.5 text-foreground/60" />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60 sm:text-sm">
            Discussion
          </h2>
        </div>
        {commentCount > 0 && (
          <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-[10px] font-bold text-foreground/50">
            {commentCount}
          </span>
        )}
      </div>

      {/* This is the ONLY scrollable region — its own ref drives scroll
          position directly, so the outer page never gets pulled along. */}
      <div ref={scrollContainerRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-5">
        {comments === null ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="clay-inset flex animate-pulse gap-2.5 px-3.5 py-2.5">
                <div className="h-7 w-7 shrink-0 rounded-full bg-foreground/10" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-1/3 rounded bg-foreground/10" />
                  <div className="h-2.5 w-2/3 rounded bg-foreground/10" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="clay-inset mb-1 grid h-12 w-12 place-items-center rounded-2xl">
              <MessageSquare className="h-5 w-5 text-foreground/20" strokeWidth={1.5} />
            </div>
            <p className="text-xs text-foreground/50">No comments yet — ask a question or share a thought.</p>
          </div>
        ) : (
          comments.map((c, i) =>
            c.isMentor ? (
              <div
                key={c.id}
                style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
                className="animate-in fade-in slide-in-from-bottom-1 clay flex gap-2.5 border-2 border-[var(--sky-deep)]/30 bg-[var(--sky-soft)]/30 px-3.5 py-2.5 duration-300"
              >
                <div className="clay flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  {c.profilePictureUrl ? (
                    <img src={c.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User2 className="h-3 w-3 text-foreground/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {c.mentorId ? (
                      <Link
                        to="/mentor-profile/$mentorId"
                        params={{ mentorId: c.mentorId }}
                        className="text-xs font-bold text-foreground hover:underline"
                      >
                        {c.studentName}
                      </Link>
                    ) : (
                      <p className="text-xs font-bold text-foreground">{c.studentName}</p>
                    )}
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-[var(--sky-deep)] text-white" />
                    <span className="rounded-full bg-[var(--sky-deep)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--sky-deep)]">
                      Mentor
                    </span>
                    <p className="text-[10px] text-foreground/40">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-foreground/80">{c.body}</p>
                </div>
              </div>
            ) : (
              <div
                key={c.id}
                style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
                className={`animate-in fade-in slide-in-from-bottom-1 clay-inset flex gap-2.5 px-3.5 py-2.5 duration-300 ${
                  c.hidden ? "opacity-50" : ""
                } ${c.isOwn ? "bg-[var(--sky-soft)]/20" : ""}`}
              >
                <div className="clay flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                  <User2 className="h-3 w-3 text-foreground/40" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold text-foreground">{c.isOwn ? "You" : c.studentName}</p>
                    <p className="text-[10px] text-foreground/40">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
                    </p>
                    {c.hidden && (
                      <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground/50">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-foreground/80">{c.body}</p>
                </div>
              </div>
            ),
          )
        )}
      </div>

      <div className="shrink-0 border-t border-foreground/10 p-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-foreground/30">
            <Clock className="hidden h-3.5 w-3.5 sm:block" />
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question…"
            className="clay-inset flex-1 rounded-2xl px-3.5 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="clay-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:opacity-70 disabled:hover:scale-100"
            aria-label="Post comment"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
        {error && (
          <p className="animate-in fade-in mt-2 text-xs font-medium text-[var(--destructive)] duration-200">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}