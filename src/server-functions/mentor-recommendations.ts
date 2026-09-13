import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import type { MentorScoreType } from "@/lib/admin-types";

export type SubjectPerformanceInput = { subject: string; percent: number };

export type MentorRecommendationCard = {
  id: string;
  name: string;
  profilePictureUrl: string | null;
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
  expertAt: string;
  whyExpertAt: string;
  scoreType: MentorScoreType | "";
  scoreValue: string;
  // Mentor's score normalized to a 0-100 "how good" number, in the same
  // terms as the student's estimated percentile — null when the score type
  // can't be fairly converted (e.g. a bare AIR rank with no candidate-pool
  // context). Used both to filter/sort and to show an actual "ahead by X"
  // comparison on the card.
  comparableScore: number | null;
  batch: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    sellingPrice: number;
    crossedPrice: number;
  } | null;
};

export type SubjectMentorRecommendation = {
  subject: string;
  studentPercentile: number;
  mentors: MentorRecommendationCard[];
};

// Same curve used client-side (live.tsx) to turn raw subject accuracy into
// an estimated percentile — duplicated here rather than imported from the
// route file so this server function has no dependency on route code.
// Keep the two in sync if the curve ever changes.
function estimateSubjectPercentile(scorePercent: number): number {
  const clamped = Math.max(0, Math.min(100, scorePercent));
  const curved = Math.round(Math.pow(clamped / 100, 1.3) * 100);
  return Math.max(1, Math.min(99, curved));
}

function parseLeadingNumber(value: string): number | null {
  const match = value.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

// Converts a mentor's Expertise Showcase score into a 0-100 number in the
// SAME terms as the student's estimated percentile, so a percentile mentor
// and a marks mentor can both be judged against the same student.
//   - "percentile": used as-is (e.g. "99.8" -> 99.8)
//   - "score": "650/720" style is normalized to a percentage; a bare
//     number already <=100 is treated as already-a-percentage
//   - "rank": AIR-style ranks have no fair conversion without knowing the
//     total candidate pool, so this returns null (treated as "always
//     qualifies" by the caller, rather than guessed at)
function mentorComparableScore(scoreType: string, scoreValue: string): number | null {
  if (!scoreValue) return null;
  if (scoreType === "percentile") {
    const n = parseLeadingNumber(scoreValue);
    return n === null ? null : Math.min(100, n);
  }
  if (scoreType === "score") {
    const fraction = scoreValue.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (fraction) {
      const num = parseFloat(fraction[1]);
      const den = parseFloat(fraction[2]);
      return den > 0 ? Math.round((num / den) * 100) : null;
    }
    const n = parseLeadingNumber(scoreValue);
    if (n === null) return null;
    return n <= 100 ? n : null;
  }
  return null; // "rank" — incomparable, not guessed at
}

// Public, unauthenticated — called right after a test result (demo now,
// real test engine later). For each subject the student is weak in, finds
// every active mentor whose Expertise Showcase (`expertAt`) covers that
// subject AND whose own score genuinely beats the student's performance in
// it — not just a text match. See mentorComparableScore above for how
// cross-unit (percentile / marks / rank) comparisons are handled.
export const getMentorRecommendationsForSubjects = createServerFn({ method: "POST" })
  .validator((data: { subjects: SubjectPerformanceInput[] }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const subjects = data.subjects.filter((s) => s.subject.trim());
    if (subjects.length === 0) return { recommendations: [] as SubjectMentorRecommendation[] };

    const mentors = await db
      .collection("mentors")
      .find({ status: "active", expertAt: { $exists: true, $nin: ["", null] } })
      .toArray();

    if (mentors.length === 0) {
      return {
        recommendations: subjects.map((s) => ({
          subject: s.subject,
          studentPercentile: estimateSubjectPercentile(s.percent),
          mentors: [] as MentorRecommendationCard[],
        })),
      };
    }

    const mentorIds = mentors.map((m) => String(m._id));
    const batches = await db
      .collection("mentorshipBatches")
      .find({ assignedMentorId: { $in: mentorIds } })
      .sort({ createdAt: -1 })
      .toArray();
    const batchByMentorId = new Map<string, (typeof batches)[number]>();
    for (const b of batches) {
      const mid = b.assignedMentorId as string;
      if (!batchByMentorId.has(mid)) batchByMentorId.set(mid, b);
    }

    function toCard(m: (typeof mentors)[number], comparableScore: number | null): MentorRecommendationCard {
      const batch = batchByMentorId.get(String(m._id));
      return {
        id: String(m._id),
        name: m.name as string,
        profilePictureUrl: (m.profilePictureUrl as string | null) ?? null,
        aiimsIitRank: (m.aiimsIitRank as string) ?? "",
        enrolledCollege: (m.enrolledCollege as string) ?? "",
        pursuedCourse: (m.pursuedCourse as string) ?? "",
        expertAt: (m.expertAt as string) ?? "",
        whyExpertAt: (m.whyExpertAt as string) ?? "",
        scoreType: (m.scoreType as MentorScoreType | null) ?? "",
        scoreValue: (m.scoreValue as string) ?? "",
        comparableScore,
        batch: batch
          ? {
              id: String(batch._id),
              name: batch.name as string,
              thumbnailUrl: (batch.thumbnailUrl as string | null) ?? null,
              sellingPrice: batch.sellingPrice as number,
              crossedPrice: batch.crossedPrice as number,
            }
          : null,
      };
    }

    const recommendations: SubjectMentorRecommendation[] = subjects.map(({ subject, percent }) => {
      const studentPercentile = estimateSubjectPercentile(percent);
      const needle = subject.trim().toLowerCase();

      const matching = mentors.filter((m) => ((m.expertAt as string) ?? "").toLowerCase().includes(needle));

      const withScores = matching.map((m) => ({
        m,
        comparable: mentorComparableScore((m.scoreType as string) ?? "", (m.scoreValue as string) ?? ""),
      }));

      // Only mentors who genuinely outperform the student qualify. A null
      // comparable score (rank-only, or unparseable) can't be disproven, so
      // it's included rather than excluded over a units mismatch.
      const qualifying = withScores.filter(({ comparable }) => comparable === null || comparable > studentPercentile);

      // Rank/incomparable mentors first (they're presumptively top-tier),
      // then highest comparable score first.
      qualifying.sort((a, b) => (b.comparable ?? 101) - (a.comparable ?? 101));

      return {
        subject,
        studentPercentile,
        mentors: qualifying.map(({ m, comparable }) => toCard(m, comparable)),
      };
    });

    return { recommendations };
  });