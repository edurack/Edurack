// "NEET Quick Mock" = the existing 20-question timed PYQ drill (route /pyq-drill, startPyqDrill, scoreDrill).
// This file is only the student-facing name, the wording for each state, and the analytics source names, so every
// entry point (homepage, dashboard, sidebar, subject practice, results, landing pages) says the same thing.
// Pure: no imports, so it is unit-tested with plain Node.

export const QUICK_MOCK_PATH = "/pyq-drill" as const;

/** Where a student found the Quick Mock. Sent with quick_mock_cta_* and quick_mock_started. */
export const QUICK_MOCK_SOURCES = ["homepage", "dashboard", "sidebar", "subject_practice", "practice_results", "pyq_landing", "pyq_browse"] as const;
export type QuickMockSource = (typeof QUICK_MOCK_SOURCES)[number];

/** Whatever was in the URL, reduced to a known source (anything else is undefined, reported as "direct"). */
export function cleanQuickMockSource(v: unknown): QuickMockSource | undefined {
  return (QUICK_MOCK_SOURCES as readonly string[]).includes(v as string) ? (v as QuickMockSource) : undefined;
}

/** "NEET Quick Mock" (or "JEE Quick Mock" for a JEE student, because the drill serves the student's own exam). */
export function quickMockName(exam?: string | null): string {
  return String(exam ?? "").toLowerCase().includes("jee") ? "JEE Quick Mock" : "NEET Quick Mock";
}

export type QuickMockInput = {
  /** False until the team publishes a Pro plan; while false nothing is limited. */
  gatingOn: boolean;
  isPro: boolean;
  /** hasFeature(access, "unlimitedDrills") */
  unlimited: boolean;
  usedToday: number;
  freeLimit: number;
  /** A drill this student already started and hasn't submitted (the server resumes it instead of using up another). */
  running?: { drillId: string; remainingSec: number } | null;
};

export type QuickMockStatus =
  | { kind: "unknown" }
  | { kind: "resume"; drillId: string; remainingSec: number }
  | { kind: "ready"; unlimited: boolean; isPro: boolean; left: number | null; freeLimit: number }
  | { kind: "exhausted"; freeLimit: number }
  | { kind: "pro_only" };

export function quickMockStatus(a: QuickMockInput | null | undefined): QuickMockStatus {
  if (!a) return { kind: "unknown" };
  if (a.running && a.running.remainingSec > 0) return { kind: "resume", drillId: a.running.drillId, remainingSec: Math.floor(a.running.remainingSec) };
  if (a.unlimited) return { kind: "ready", unlimited: true, isPro: a.isPro, left: null, freeLimit: a.freeLimit };
  if (a.gatingOn && a.freeLimit <= 0) return { kind: "pro_only" };
  const left = Math.max(0, a.freeLimit - a.usedToday);
  return left > 0 ? { kind: "ready", unlimited: false, isPro: a.isPro, left, freeLimit: a.freeLimit } : { kind: "exhausted", freeLimit: a.freeLimit };
}

export const EXHAUSTED_MESSAGE = "You've completed today's free Quick Mock. Come back tomorrow for another, or unlock unlimited practice with Edurack Pro.";

export type QuickMockCopy = { headline: string; detail: string | null; cta: string; /** The CTA starts something (true) or only explains (false). */ canStart: boolean };

export function quickMockCopy(s: QuickMockStatus): QuickMockCopy {
  switch (s.kind) {
    case "resume":
      return { headline: "Your Quick Mock is in progress", detail: `${Math.max(1, Math.ceil(s.remainingSec / 60))} min left on the clock`, cta: "Resume Quick Mock", canStart: true };
    case "ready":
      return s.unlimited && s.isPro
        ? { headline: "Your Quick Mock is ready!", detail: "Unlimited with Edurack Pro", cta: "Start Quick Mock", canStart: true }
        : { headline: "Your free Quick Mock is ready!", detail: !s.unlimited && s.left !== null && s.freeLimit > 1 ? `${s.left} of ${s.freeLimit} free today` : null, cta: "Start Quick Mock", canStart: true };
    case "exhausted":
      return { headline: EXHAUSTED_MESSAGE, detail: null, cta: "See you tomorrow", canStart: false };
    case "pro_only":
      return { headline: "Quick Mock is part of Edurack Pro", detail: "Unlock timed mocks with a Pro plan", cta: "Explore Edurack Pro", canStart: false };
    default:
      return { headline: "Practise under exam pressure", detail: null, cta: "Start Quick Mock", canStart: true };
  }
}

/**
 * Homepage promise: can an anonymous visitor really start a FREE Quick Mock? Yes unless the free plan has no drills
 * while Pro is on sale. (They still need an account to take it; the CTA says where that goes.)
 */
export const freeQuickMockOffered = (offer: { gatingOn: boolean; freeLimit: number } | null | undefined): boolean => !offer || !offer.gatingOn || offer.freeLimit > 0;

/** Path + search for a Quick Mock link, so every entry point builds the URL the same way. */
export function quickMockSearch(opts: { exam?: string | null; src?: QuickMockSource; drillId?: string }): { exam?: string; src?: QuickMockSource; drillId?: string } {
  return { ...(opts.exam ? { exam: opts.exam } : {}), ...(opts.src ? { src: opts.src } : {}), ...(opts.drillId ? { drillId: opts.drillId } : {}) };
}
