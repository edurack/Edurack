// Shared (client + server) types for one-tap outreach. Pure — no server imports.
export type OutreachExam = "neet" | "jee" | "cuet" | "ipmat";
export type OutreachAsset = { label: string; url: string };

export type OutreachAudience = {
  exam: OutreachExam | "any";
  track: "any" | "11th" | "12th" | "Dropper";
  /** Only students who have never bought anything — the usual "intro + free PDFs" audience. */
  nonBuyersOnly: boolean;
  /**
   * "auto" (default, and the only mode older saved campaigns have): exam/track/nonBuyersOnly decide who's in.
   * "manual": the admin picked the audience by hand in the composer — exam/track/nonBuyersOnly are ignored,
   * and the frequency cooldown (OUTREACH_MIN_GAP_DAYS) is skipped too, since picking someone by name is already
   * a deliberate choice. The marketing unsubscribe and the bounce/spam-complaint block still always apply.
   */
  mode?: "auto" | "manual";
  /** Manual mode only. true = start from every eligible student and remove `excludeUids` (deselect a few). false = start from nobody and use only `includeUids` (hand-pick a few). */
  manualAll?: boolean;
  /** Manual mode + manualAll: students to leave out. */
  excludeUids?: string[];
  /** Manual mode + !manualAll: the hand-picked students to include. */
  includeUids?: string[];
};

/** One student as shown in the manual-selection picker. */
export type OutreachStudentPick = { uid: string; fullName?: string; email: string };

export type OutreachCampaign = {
  id: string;
  name: string;
  subject: string;
  /** Plain text. {{name}} → student's first name. */
  message: string;
  assets: OutreachAsset[];
  audience: OutreachAudience;
  lastSentAt: string | null;
};

export type OutreachJobView = {
  id: string;
  campaignId: string;
  status: "running" | "done";
  total: number;
  sent: number;
  failed: number;
  startedAt: string;
  /** Set when a running job is paused on purpose (quiet hours). It resumes by itself via /cron/outreach. */
  waiting?: "quiet_hours";
};

export const EMPTY_CAMPAIGN: Omit<OutreachCampaign, "id" | "lastSentAt"> = {
  name: "",
  subject: "",
  message: "",
  assets: [],
  audience: { exam: "neet", track: "any", nonBuyersOnly: false },
};

export const NEET_STARTER: Omit<OutreachCampaign, "id" | "lastSentAt"> = {
  name: "NEET intro + PYQ PDFs",
  subject: "Your free NEET PYQ pack from Edurack 📚",
  message:
    "Hi {{name}}, welcome to Edurack!\n\nEdurack is a NEET/JEE practice platform: chapter-wise PYQs with solutions, a daily question to build your streak, spaced revision of your mistakes, and full mock tests.\n\nHere are the PYQ PDFs to get you started — and when you're ready, solve one question a day to start your streak.",
  assets: [{ label: "Download NEET PYQ PDFs", url: "https://www.edurack.in/blog" }],
  audience: { exam: "neet", track: "any", nonBuyersOnly: false },
};
