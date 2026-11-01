// "What's new on Edurack": dated release notes. One entry per release, newest first. Each becomes its own indexable page
// (/whats-new/<slug>) with Article JSON-LD, is listed on /whats-new, in the sitemap, in the Atom feed (/whats-new/feed.xml)
// and in /llms.txt, so search engines and AI answers can cite what changed and when.
//
// KEEP THIS HONEST. Add an entry only for something that is live, with the date it went live. Dates are the date of the
// release (YYYY-MM-DD, India). Write for students: what changed, why it matters, where to try it. No numbers you cannot back up.
import { SITE_URL } from "@/lib/seo";

export type ReleaseItem = { title: string; body: string; href?: string; linkLabel?: string };
export type Release = {
  slug: string;
  date: string;
  title: string;
  summary: string;
  /** Who it is for. */
  audience: string;
  items: ReleaseItem[];
  /** One short paragraph on why this release matters to a student. */
  why: string;
};

export const RELEASES: Release[] = [
  {
    slug: "2026-10-31-time-analysis-challenges-countdowns",
    date: "2026-10-31",
    title: "Time analysis, friend challenges and exam countdowns",
    summary: "Quick Mocks and tests now show where your time went, you can challenge a friend on the same 20 questions, and there are countdown and study-plan tools for JEE Main 2027 and NEET UG 2027.",
    audience: "NEET and JEE students",
    items: [
      {
        title: "Where your time and marks went",
        body: "Edurack now records how long you spend on each question in Quick Mocks and tests. After you finish, you see a short summary of your time. Edurack Pro adds the full breakdown: which wrong answers came in under 20 seconds and were probably rushed guesses, how much time went on questions you still got wrong, how your pace compares across subjects, and what the rushed answers cost you in negative marks. Attempts made before this update have no timing.",
        href: "/pro",
        linkLabel: "See Edurack Pro",
      },
      {
        title: "Challenge a friend",
        body: "After a Quick Mock, tap Challenge a friend to share the same 20 questions on the same clock. Your friend needs an account to take it. Students who take part see a scoreboard with first names and scores; anyone else sees only the challenger's score. A challenge lasts 14 days and takes up to 10 students, and taking one does not use up your free Quick Mocks for the day.",
        href: "/pyq-drill",
        linkLabel: "Open a Quick Mock",
      },
      {
        title: "Invite a friend and you both get 3 days of Pro",
        body: "The invite reward changed from an extra Quick Mock a day to 3 days of Edurack Pro for both of you. It is paid when your friend finishes their first Quick Mock, so every Pro feature opens for them straight away. You can earn it for up to 10 friends. Bonuses already earned under the old reward stay until they expire.",
      },
      {
        title: "Revision reminders by email",
        body: "If you have five or more mistakes that you made 1, 3, 7 or 14 days ago, Edurack can email you that they are due for another look. The email links to your notebook, which is free. Every email has an unsubscribe link.",
      },
      {
        title: "JEE Main 2027 countdown and study plan",
        body: "See the days left to Session 1 (20 to 24 and 28 January 2027) or Session 2 (2 to 7 April 2027), using the dates in NTA's public notice of 24 October 2026, and get a day-by-day plan from your daily hours and how much of the syllabus is done.",
        href: "/tools/jee-main-countdown",
        linkLabel: "Open the JEE Main 2027 planner",
      },
      {
        title: "NEET UG 2027 countdown and study plan",
        body: "NTA had not announced the NEET UG 2027 date when we checked, so this tool counts down to a planning date of 2 May 2027, says so clearly, and lets you enter any date. We will switch to the official date when NTA publishes it.",
        href: "/tools/neet-countdown",
        linkLabel: "Open the NEET UG 2027 planner",
      },
    ],
    why: "Practice only helps if you can see what to change. These updates show where your time goes, give you someone to compete with, and turn the days left before your exam into a plan.",
  },
  {
    slug: "2026-10-30-revise-mistakes-and-jee-rank-calculator",
    date: "2026-10-30",
    title: "Revise your mistakes and a JEE Main rank calculator",
    summary: "A Pro drill built from the questions you got wrong, a timed drill on your weakest chapter, a free JEE Main percentile-to-rank calculator, and a clearer privacy policy.",
    audience: "NEET and JEE students",
    items: [
      {
        title: "Revise your mistakes (Edurack Pro)",
        body: "A timed drill built from the questions you got wrong, oldest first, so mistakes from long ago come back before you forget them. Students without Pro can see how many mistakes are waiting.",
        href: "/pyq-drill",
        linkLabel: "Open a Quick Mock",
      },
      {
        title: "Drill your weakest chapter",
        body: "On a test result, tap the timed drill on your weakest chapter to practise exactly the chapter that cost you marks. You can also practise that chapter untimed for free.",
      },
      {
        title: "JEE Main percentile to rank calculator",
        body: "Turn your NTA percentile into an expected All-India Rank, or a rank into a percentile, using the number of candidates in JEE Main 2026. NTA does not publish marks versus percentile, so the marks table shows the range seen across the April 2026 shifts, compiled from published reports.",
        href: "/tools/jee-main-percentile-calculator",
        linkLabel: "Open the calculator",
      },
      {
        title: "Mobile number and consent at sign-up",
        body: "Sign-up now asks for your mobile number so Edurack can reach you about your account, sessions and preparation. Offers on WhatsApp and SMS are a separate, optional tick that you can change at any time on your Profile page.",
      },
      {
        title: "A full Privacy Policy",
        body: "The Privacy Policy page now explains what Edurack collects, why, which services process it, and how to ask for your information to be corrected or deleted.",
        href: "/legal/privacy",
        linkLabel: "Read the Privacy Policy",
      },
      {
        title: "Practice nudge emails",
        body: "A reminder to take your first Quick Mock a day after you sign up, and a note about the chapter you struggled with the day before. You can unsubscribe from them in one click.",
      },
    ],
    why: "Most of your marks are won back from mistakes you have already made. This release makes them easy to find and go back to, and gives JEE students a way to turn a percentile into a rank.",
  },
  {
    slug: "2026-10-29-focus-on-neet-and-jee",
    date: "2026-10-29",
    title: "A clearer homepage focused on NEET and JEE",
    summary: "The homepage now speaks to NEET and JEE students, explains what Edurack is, answers common questions, and remembers your exam.",
    audience: "NEET and JEE students",
    items: [
      {
        title: "NEET and JEE first",
        body: "The homepage now speaks to NEET and JEE students, and an exam switcher changes the sample test to match your exam. CUET and IPMAT are coming soon.",
        href: "/",
        linkLabel: "Go to the homepage",
      },
      {
        title: "What Edurack is, and answers to common questions",
        body: "A plain explanation of Edurack and a FAQ on the homepage: what is free, how the mock test differs from a normal quiz, how mentors are verified, and how Edurack differs from companies with similar names.",
        href: "/faq",
        linkLabel: "Read the FAQ",
      },
      {
        title: "Your exam is remembered",
        body: "Pick NEET or JEE once and the homepage and the sign-up screen remember it, so you do not choose twice.",
      },
    ],
    why: "A student landing on Edurack should know within seconds what it is, whether it covers their exam, and what it costs. This release makes that clear.",
  },
  {
    slug: "2026-09-10-edurack-launches",
    date: "2026-09-10",
    title: "Edurack launches",
    summary: "Edurack opens with a computer-based test screen modelled on the NTA exam, chapter-wise previous year questions with solutions, and mentor-led batches.",
    audience: "NEET and JEE students",
    items: [
      {
        title: "A computer-based test screen like the real exam",
        body: "The simulator replicates the NTA computer-based test screen, including the question palette, the timer placement and the navigation, so exam day is not the first time you see that interface. You can try it free, with no sign-up.",
        href: "/simulator/live",
        linkLabel: "Try the free demo",
      },
      {
        title: "Previous year questions, chapter by chapter",
        body: "Practise previous year questions chapter-wise and topic-wise, with step-by-step solutions.",
        href: "/pyq",
        linkLabel: "Start practising",
      },
      {
        title: "Mentor-led batches",
        body: "Independent mentors design, price and run their own batches and test series. Each mentor verifies the exam rank, institution and credentials shown on their profile before publishing a batch.",
      },
    ],
    why: "Edurack is built around practising in the same conditions as the exam, and learning from people who have already cleared it.",
  },
];

export const latestRelease = () => RELEASES[0];
export const releaseBySlug = (slug: string) => RELEASES.find((r) => r.slug === slug) ?? null;
export const releaseUrl = (r: Release) => `${SITE_URL}/whats-new/${r.slug}`;
/** Neighbours in time: `newer` is the release after this one, `older` the one before it. */
export function neighbours(slug: string): { newer: Release | null; older: Release | null } {
  const i = RELEASES.findIndex((r) => r.slug === slug);
  if (i < 0) return { newer: null, older: null };
  return { newer: RELEASES[i - 1] ?? null, older: RELEASES[i + 1] ?? null };
}

export const formatReleaseDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The Atom feed for /whats-new/feed.xml. */
export function atomFeedXml(releases: Release[] = RELEASES): string {
  const updated = releases[0] ? `${releases[0].date}T00:00:00+05:30` : new Date().toISOString();
  const entries = releases
    .map((r) => {
      const body = r.items.map((i) => `<h3>${esc(i.title)}</h3><p>${esc(i.body)}</p>`).join("") + `<p>${esc(r.why)}</p>`;
      return `  <entry>
    <id>${esc(releaseUrl(r))}</id>
    <title>${esc(r.title)}</title>
    <link rel="alternate" type="text/html" href="${esc(releaseUrl(r))}"/>
    <published>${r.date}T00:00:00+05:30</published>
    <updated>${r.date}T00:00:00+05:30</updated>
    <summary>${esc(r.summary)}</summary>
    <content type="html">${esc(body)}</content>
  </entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_URL}/whats-new</id>
  <title>What's new on Edurack</title>
  <subtitle>Dated release notes for NEET and JEE students.</subtitle>
  <link rel="self" type="application/atom+xml" href="${SITE_URL}/whats-new/feed.xml"/>
  <link rel="alternate" type="text/html" href="${SITE_URL}/whats-new"/>
  <updated>${updated}</updated>
  <author><name>Edurack</name></author>
${entries}
</feed>
`;
}
