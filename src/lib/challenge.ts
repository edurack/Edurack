// Friend challenges: share a finished Quick Mock; a friend attempts the SAME 20 questions on the same clock, and the two
// scores are compared. Pure rules and types shared by the server and the UI.
//
// A challenge is created from a student's finished Quick Mock, so the creator's own score is already on the board. Anyone with
// the link can attempt it once. Only students who took part see the whole scoreboard (first names only); everyone else sees just
// the creator's score, enough to want to beat it.
import { SITE_URL } from "@/lib/seo";

export const CHALLENGE_MAX_PARTICIPANTS = 10;
export const CHALLENGE_TTL_DAYS = 14;
export const CHALLENGES_PER_DAY = 10;

const CODE = /^[23456789A-HJ-NP-Z]{6}$/;
export const isValidChallengeCode = (v: unknown): v is string => typeof v === "string" && CODE.test(v);
export const normalizeChallengeCode = (v: string) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);

/** The challenge link. `ref` is the sharer's referral code, so a friend who signs up through it counts as their referral too. */
export const challengeLink = (code: string, origin: string = SITE_URL, ref?: string | null) => `${origin}/challenge/${code}${ref ? `?ref=${ref}` : ""}`;

export type ChallengeEntry = {
  /** First name only. */
  name: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTakenSec: number;
  isCreator: boolean;
  isYou: boolean;
};

export type ChallengeView = {
  code: string;
  exam: string | null;
  creatorName: string;
  questionCount: number;
  durationMin: number;
  expired: boolean;
  full: boolean;
  /** The creator's result (always shown: it is the thing to beat). */
  creator: { score: number; maxScore: number; timeTakenSec: number } | null;
  /** The whole scoreboard for students who took part; just the creator for everyone else. */
  entries: ChallengeEntry[];
  participants: number;
  you: { status: "none" | "running" | "done"; drillId?: string };
};

/** Best score first; on equal scores the faster time wins. */
export function rankEntries(entries: ChallengeEntry[]): ChallengeEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.timeTakenSec - b.timeTakenSec);
}

/** One plain sentence comparing a student with the creator. */
export function compareLine(you: Pick<ChallengeEntry, "score">, other: Pick<ChallengeEntry, "score" | "name">): string {
  const diff = you.score - other.score;
  if (diff > 0) return `You beat ${other.name} by ${diff} mark${diff === 1 ? "" : "s"}.`;
  if (diff < 0) return `${other.name} is ahead by ${-diff} mark${diff === -1 ? "" : "s"}. Ask for a rematch.`;
  return `You and ${other.name} tied on ${you.score}.`;
}

/** A first name for display: first word, no more than 20 characters, tidied up. A blank name becomes "A friend". */
export function displayFirstName(full: unknown): string {
  const first = String(full ?? "").trim().split(/\s+/)[0]?.slice(0, 20) ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "A friend";
}
