// Picks the questions for a "Practice my weak topics" session. Pure so it can
// be unit-tested without a database.
import type { PyqQuestion, PyqStatus } from "@/lib/pyq-types";

export type WeakChapter = { subject: string; chapter: string };

export const weakKey = (subject: string, chapter: string) => `${subject}|${chapter.trim().toLowerCase()}`;

// What to serve first inside a chapter: things never seen, then solutions the
// student only peeked at, then ones they got wrong, and already-solved last.
const STATUS_RANK: Record<PyqStatus, number> = { new: 0, revealed: 1, wrong: 2, correct: 3 };

/** Round-robin across groups, so a session mixes chapters instead of 12 Kinematics in a row. */
export function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < longest; i++) for (const g of groups) if (i < g.length) out.push(g[i]);
  return out;
}

export function pickWeakQuestions(
  chapters: WeakChapter[],
  questions: PyqQuestion[],
  opts: { perChapter?: number; total?: number } = {},
): PyqQuestion[] {
  const perChapter = opts.perChapter ?? 12;
  const total = opts.total ?? 40;

  const byChapter = new Map<string, PyqQuestion[]>();
  for (const c of chapters) byChapter.set(weakKey(c.subject, c.chapter), []);
  for (const q of questions) byChapter.get(weakKey(q.subject, q.chapter))?.push(q);

  const groups = chapters.map((c) =>
    (byChapter.get(weakKey(c.subject, c.chapter)) ?? [])
      .map((q, i) => ({ q, i }))
      // Stable: keeps the caller's order (newest paper first) within a status.
      .sort((a, b) => STATUS_RANK[a.q.status] - STATUS_RANK[b.q.status] || a.i - b.i)
      .map((x) => x.q)
      .slice(0, perChapter),
  );
  return interleave(groups).slice(0, total);
}
