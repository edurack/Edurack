// Admin -> Growth ops: the numbers behind the growth features (nudge emails, referrals, phone-number consent, Pro drills,
// challenges and timing). Types only, shared by the server and the admin screen.
export type GrowthOps = {
  days: number;
  generatedAt: string;
  emails: {
    byKind: { kind: string; label: string; sent: number; failed: number }[];
    studentsEmailed: number;
    streakReminders: number;
    optedOut: { nudges: number; streak: number; marketing: number };
    optedOutInWindow: { nudges: number; streak: number; marketing: number };
  };
  referrals: {
    total: number;
    byStatus: { pending: number; rewarded: number; rejected: number };
    rejectedByReason: { reason: string; label: string; n: number }[];
    createdInWindow: number;
    rewardedInWindow: number;
    proDaysGivenInWindow: number;
    top: { email: string | null; rewarded: number; invited: number }[];
  };
  consent: {
    profiles: number;
    withRealMobile: number;
    withConsentRecord: number;
    marketingOptIn: number;
    /** Of the students who have a consent record. Null when there are none yet. */
    marketingOptInPct: number | null;
    withoutConsentRecord: number;
  };
  pro: {
    drillsStarted: number;
    drillsSubmitted: number;
    studentsDrilling: number;
    byType: { standard: number; custom: number; revision: number; challenge: number };
    grantsInWindow: { paid: number; gift: number; referral: number };
    proStudentsNow: number;
  };
  challenges: { created: number; attemptsStarted: number; attemptsCompleted: number };
  timing: { submitted: number; withTimes: number };
};
