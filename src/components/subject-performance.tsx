import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  getMentorRecommendationsForSubjects,
  type SubjectMentorRecommendation,
} from "@/server-functions/mentor-recommendations";

export type SubjectPerformanceRow = {
  subject: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  // 0-100 — whatever the caller considers "how well did they do" (marks%
  // for a single attempt, aggregate accuracy% across attempts, etc).
  percent: number;
  // Optional right-aligned label in the collapsed row header, e.g. "12 / 40 marks".
  marksLabel?: string;
};

// Demo/estimate curve — turns raw subject performance into an estimated
// percentile. This is NOT a real population percentile (there isn't yet a
// large enough pool of actual attempts to compare against); it's labeled
// as an estimate everywhere it's shown. Swap this out for a real
// aggregation once that data exists — every caller (demo, result page,
// analysis page) goes through this one function, so the swap only needs
// to happen here.
export function estimateSubjectPercentile(scorePercent: number): number {
  const clamped = Math.max(0, Math.min(100, scorePercent));
  const curved = Math.round(Math.pow(clamped / 100, 1.3) * 100);
  return Math.max(1, Math.min(99, curved));
}

export function SubjectBreakdownAccordion({ subjects }: { subjects: SubjectPerformanceRow[] }) {
  const [openSubject, setOpenSubject] = useState<string | null>(subjects[0]?.subject ?? null);

  return (
    <div className="space-y-2">
      {subjects.map((s) => {
        const attempted = s.correct + s.incorrect;
        const accuracyPct = attempted > 0 ? Math.round((s.correct / attempted) * 100) : 0;
        const percentile = estimateSubjectPercentile(s.percent);
        const isOpen = openSubject === s.subject;

        return (
          <div key={s.subject} className="clay-inset overflow-hidden rounded-2xl">
            <button
              onClick={() => setOpenSubject(isOpen ? null : s.subject)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{s.subject}</span>
                {s.marksLabel && <span className="text-xs text-foreground/50">{s.marksLabel}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[var(--sky-deep)]">{Math.round(s.percent)}%</span>
                <ChevronDown
                  className={`h-4 w-4 text-foreground/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-foreground/10 px-4 py-3">
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <MiniStat label="Correct" value={s.correct} color="text-[var(--mint-soft)]" />
                  <MiniStat label="Incorrect" value={s.incorrect} color="text-[var(--coral-soft)]" />
                  <MiniStat label="Unattempted" value={s.unanswered} color="text-foreground/40" />
                  <MiniStat label="Accuracy" value={`${accuracyPct}%`} color="text-foreground" />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-foreground/50">Estimated percentile in {s.subject}</span>
                  <span className="font-bold text-foreground">{percentile}th</span>
                </div>
                <div className="clay-inset mt-1.5 h-2 overflow-hidden rounded-full">
                  <div className="h-full rounded-full bg-[var(--sky-deep)]" style={{ width: `${percentile}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="clay rounded-xl px-2 py-2 text-center">
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-foreground/50">{label}</p>
    </div>
  );
}

// Only recommends mentors whose own score genuinely beats the student's
// performance in that subject (see getMentorRecommendationsForSubjects for
// how percentile/marks/rank are compared on a level footing) — a text
// match on `expertAt` alone is never enough to qualify.
export function MentorRecommendations({
  subjects,
  weakThreshold = 60,
}: {
  subjects: { subject: string; percent: number }[];
  weakThreshold?: number;
}) {
  const [recs, setRecs] = useState<SubjectMentorRecommendation[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const weakSubjects = subjects.filter((s) => s.percent < weakThreshold);

    if (weakSubjects.length === 0) {
      setRecs(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getMentorRecommendationsForSubjects({ data: { subjects: weakSubjects } })
      .then((res) => setRecs(res.recommendations))
      .catch((err) => {
        console.error("[MentorRecommendations] fetch failed:", err);
        setRecs([]);
      })
      .finally(() => setLoading(false));
    // Subjects arrays are rebuilt fresh each render, so compare by content,
    // not by reference — avoids an infinite refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(subjects), weakThreshold]);

  if (loading) return null;
  const withMentors = (recs ?? []).filter((r) => r.mentors.length > 0);
  if (withMentors.length === 0) return null;

  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">Recommended for you</p>
      <h3 className="font-display mb-4 text-lg font-bold text-foreground">Mentors who can help you improve</h3>

      <div className="space-y-6">
        {withMentors.map(({ subject, studentPercentile, mentors }) => (
          <div key={subject}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--sky-deep)]">
              Struggling with {subject}? These mentors scored higher than your {studentPercentile}th percentile
            </p>
            <div className="space-y-3">
              {mentors.slice(0, 3).map((mentor) => (
                <div key={mentor.id} className="clay-inset rounded-2xl p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      {mentor.profilePictureUrl ? (
                        <img
                          src={mentor.profilePictureUrl}
                          alt={mentor.name}
                          className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--sky-soft)] text-lg font-bold text-foreground">
                          {mentor.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-foreground">{mentor.name}</p>
                        <p className="text-xs text-foreground/50">
                          {[mentor.pursuedCourse, mentor.enrolledCollege].filter(Boolean).join(" · ") ||
                            "Edurack Mentor"}
                        </p>
                        {mentor.scoreType && mentor.scoreValue && (
                          <p className="mt-0.5 text-xs font-semibold text-[var(--sky-deep)]">
                            {mentor.scoreValue}{" "}
                            {mentor.scoreType === "percentile"
                              ? "Percentile"
                              : mentor.scoreType === "rank"
                                ? "Rank"
                                : "Score"}{" "}
                            in {mentor.expertAt}
                            {mentor.comparableScore !== null && (
                              <span className="text-foreground/40">
                                {" "}
                                · {Math.round(mentor.comparableScore - studentPercentile)} pts ahead of you
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex-1">
                      {mentor.whyExpertAt && (
                        <p className="line-clamp-2 text-xs text-foreground/60">{mentor.whyExpertAt}</p>
                      )}
                      {mentor.batch && (
                        <p className="mt-1 text-xs text-foreground/50">
                          Batch: <span className="font-semibold text-foreground">{mentor.batch.name}</span> · ₹
                          {mentor.batch.sellingPrice}
                        </p>
                      )}
                    </div>

                    <Link
                      to="/mentor-profile/$mentorId"
                      params={{ mentorId: mentor.id }}
                      className="clay-btn shrink-0 rounded-full px-5 py-2.5 text-center text-xs font-bold uppercase tracking-wide"
                    >
                      View Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}