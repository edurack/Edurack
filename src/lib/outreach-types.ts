// Shared (client + server) types for one-tap outreach. Pure — no server imports.
export type OutreachExam = "neet" | "jee" | "cuet" | "ipmat";
export type OutreachAsset = { label: string; url: string };

export type OutreachAudience = {
  exam: OutreachExam | "any";
  track: "any" | "11th" | "12th" | "Dropper";
  /** Only students who have never bought anything — the usual "intro + free PDFs" audience. */
  nonBuyersOnly: boolean;
};

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
