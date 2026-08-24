import { useEffect, useState } from "react";
import { Library, Eye, CheckCircle2, MessageSquare, Star, ChevronDown, EyeOff, Send, Loader2, PlayCircle } from "lucide-react";
import { listMyLectureLibrary, listLectureComments, setLectureCommentVisibility, postMentorLectureComment } from "@/server-functions/mentor-portal";
import { ModuleHeader, StatChip, LoadingBlock, EmptyState } from "@/components/mentor-portal-ui";

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

export function MentorLectureLibraryModule({ mentorToken }: { mentorToken: string }) {
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function refreshLibrary() {
    const { lectures: rows } = await listMyLectureLibrary({ data: { token: mentorToken } });
    setLectures(rows);
  }

  useEffect(() => {
    refreshLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorToken]);

  return (
    <div>
      <ModuleHeader
        title="Lecture Library"
        subtitle="Every lecture you've uploaded, with viewer stats, ratings, and comment moderation."
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
                <button
                  onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                  className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-foreground/70"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Comments ({l.commentCount})
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedId === l.id ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip icon={Eye} label="Viewers" value={l.viewerCount} />
                <StatChip icon={CheckCircle2} label="Completed" value={l.completedCount} tone={l.completedCount > 0 ? "mint" : "neutral"} />
                <StatChip icon={MessageSquare} label="Comments" value={l.commentCount} />
                <StatChip icon={Star} label="Rating" value={l.avgRating !== null ? `${l.avgRating} (${l.reviewCount})` : "—"} tone="sky" />
              </div>

              {expandedId === l.id && (
                <LectureCommentAuditor mentorToken={mentorToken} sessionId={l.id} onCommentPosted={refreshLibrary} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div className="mt-4">
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