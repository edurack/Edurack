// Built-in outreach template library (pure data — safe on client and server).
// Message formatting understood by the email renderer:
//   "# Headline"        → big headline at the top of the email
//   "**bold**"          → bold
//   lines starting "- " → check-mark list
//   "> text"            → highlighted callout box
//   {{name}}            → student's first name (subject + message)
import type { OutreachCampaign } from "@/lib/outreach-types";
import { TEMPLATES_A } from "@/lib/outreach-templates-a";
import { TEMPLATES_B } from "@/lib/outreach-templates-b";
import { TEMPLATES_C } from "@/lib/outreach-templates-c";

const SITE = "https://www.edurack.in";

export type TemplateCategory =
  | "Welcome" | "Habit" | "Strategy" | "By class" | "Growth"
  | "By exam" | "Exam countdown" | "Tests & results" | "Win-back" | "Live & mentors" | "Parents"
  | "Community" | "Updates" | "Sales" | "Support" | "Motivation" | "Hinglish";
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Welcome", "Habit", "Strategy", "By exam", "By class", "Exam countdown", "Tests & results", "Win-back",
  "Live & mentors", "Parents", "Community", "Updates", "Sales", "Support", "Motivation", "Hinglish", "Growth",
];

export type OutreachTemplate = {
  key: string;
  emoji: string;
  category: TemplateCategory;
  title: string;
  /** One line: what this email does for you. */
  tagline: string;
  /** When it works best. */
  sendWhen: string;
  /** Soft pastel used on the card header. */
  tint: string;
  /** True when subject/message still contain [blanks] the admin must fill in before sending. */
  needsEdit?: boolean;
  campaign: Omit<OutreachCampaign, "id" | "lastSentAt">;
};

const aud = (exam: OutreachCampaign["audience"]["exam"], track: OutreachCampaign["audience"]["track"] = "any") => ({ exam, track, nonBuyersOnly: false });

const CORE_TEMPLATES: OutreachTemplate[] = [
  {
    key: "welcome-pyq",
    emoji: "📚",
    category: "Welcome",
    title: "Welcome + PYQ Blueprints",
    tagline: "Introduce Edurack and hand over your PDFs.",
    sendWhen: "First email to anyone new",
    tint: "#DCEAFB",
    campaign: {
      name: "Welcome + PYQ Blueprints",
      subject: "{{name}}, your NEET PYQ Blueprint 2020–26 is here 📚",
      message:
        "# Your NEET PYQ Blueprint is ready\n\nHi {{name}}, welcome to Edurack!\n\nWe organised **NEET 2020–26 PYQs subject-wise, chapter-wise and topic-wise**, so you can see exactly where the marks come from and spend your time there.\n\n- Physics, Chemistry, Botany and Zoology Blueprints (PDF)\n- Chapter-wise practice with in-depth solutions\n- A daily question streak that keeps you consistent\n\n> Everything on Edurack is free right now. Download the PDFs, then try three real NEET questions.",
      assets: [
        { label: "Download the PYQ Blueprints", url: `${SITE}/blog` },
        { label: "Practice NEET PYQs", url: `${SITE}/pyq` },
      ],
      audience: aud("neet"),
    },
  },
  {
    key: "first-question",
    emoji: "⚡",
    category: "Habit",
    title: "Solve your first question",
    tagline: "Gets a signed-up student to take the first action.",
    sendWhen: "2–3 days after sign-up",
    tint: "#F7ECC4",
    campaign: {
      name: "Solve your first question",
      subject: "{{name}}, 2 minutes. One real NEET question.",
      message:
        "# Start with just one question\n\nHi {{name}},\n\nYou don't need a plan or a free evening. Open Edurack, pick any chapter and solve **one NEET PYQ**. That's it.\n\nIt takes about two minutes, it starts your streak, and you'll see how NEET really asks questions.\n\n> Tomorrow, do one more. That's how a habit starts.",
      assets: [{ label: "Solve my first question", url: `${SITE}/pyq` }],
      audience: aud("neet"),
    },
  },
  {
    key: "streak-challenge",
    emoji: "🔥",
    category: "Habit",
    title: "7-day streak challenge",
    tagline: "Turns casual visitors into daily practisers.",
    sendWhen: "Monday morning",
    tint: "#F8D9C6",
    campaign: {
      name: "7-day streak challenge",
      subject: "🔥 {{name}}, can you keep a 7-day streak?",
      message:
        "# The 7-day streak challenge\n\nHi {{name}},\n\nHere's a simple challenge for this week: **answer at least one PYQ every day for 7 days.**\n\n- Takes 2–5 minutes a day\n- Edurack tracks your streak automatically\n- Miss a day and it resets, so don't skip\n\n> Students who practise daily remember more than students who cram once a week. Start today.",
      assets: [{ label: "Start my streak", url: `${SITE}/pyq` }],
      audience: aud("neet"),
    },
  },
  {
    key: "weightage",
    emoji: "📊",
    category: "Strategy",
    title: "Chapter-wise weightage",
    tagline: "Shows which chapters carry the most marks.",
    sendWhen: "Mid-week, when planning is on their mind",
    tint: "#CDF0DD",
    campaign: {
      name: "Chapter-wise weightage",
      subject: "Which chapters give the most NEET marks? 📊",
      message:
        "# Study where the marks are\n\nHi {{name}},\n\nNot every NEET chapter carries the same weight. We went through the 2020–26 papers and organised the questions chapter by chapter.\n\n- See which chapters NEET asks from most\n- Find your weak chapters first\n- Practise their PYQs right away\n\n> Pick your three weakest high-weightage chapters this week.",
      assets: [
        { label: "See chapter-wise weightage", url: `${SITE}/neet/chapter-wise-weightage` },
        { label: "Practise those chapters", url: `${SITE}/pyq` },
      ],
      audience: aud("neet"),
    },
  },
  {
    key: "mistakes",
    emoji: "🎯",
    category: "Strategy",
    title: "Learn from your mistakes",
    tagline: "Promotes revision of wrong answers.",
    sendWhen: "After a week of practice",
    tint: "#DCEAFB",
    campaign: {
      name: "Learn from your mistakes",
      subject: "{{name}}, your wrong answers are your best teacher",
      message:
        "# Don't lose the same mark twice\n\nHi {{name}},\n\nMost students solve a question, check the answer and move on. The ones who improve fastest do something different: **they come back to what they got wrong.**\n\nEdurack brings your mistakes back for revision, so one wrong answer today doesn't cost you marks on exam day.\n\n> Open your dashboard and clear your revision list today.",
      assets: [{ label: "Open my dashboard", url: `${SITE}/dashboard` }],
      audience: aud("neet"),
    },
  },
  {
    key: "mock-test",
    emoji: "📝",
    category: "Strategy",
    title: "Try a full mock test",
    tagline: "Moves students from chapters to full papers.",
    sendWhen: "Weekend",
    tint: "#F7ECC4",
    campaign: {
      name: "Try a full mock test",
      subject: "{{name}}, ready for a full NEET test this weekend?",
      message:
        "# Time to test yourself\n\nHi {{name}},\n\nPractising chapters builds knowledge. A full paper builds **speed and stamina**, and NEET tests both.\n\n- Take a full mock under timed conditions\n- Check the analysis to see which topics cost you marks\n- Repeat once a week and watch the score move\n\n> The free NEET test series is waiting in your dashboard.",
      assets: [{ label: "Open my dashboard", url: `${SITE}/dashboard` }],
      audience: aud("neet"),
    },
  },
  {
    key: "dropper",
    emoji: "🚀",
    category: "By class",
    title: "For droppers",
    tagline: "Speaks to the drop-year students' consistency problem.",
    sendWhen: "Anytime",
    tint: "#C9EEE8",
    campaign: {
      name: "Droppers — make this attempt count",
      subject: "{{name}}, make this attempt count",
      message:
        "# Make this attempt count\n\nHi {{name}},\n\nA drop year is long, and the hardest part is staying consistent when nobody is checking on you.\n\nEdurack gives you **chapter-wise NEET PYQs with solutions, a daily streak and revision of your mistakes**, free to use.\n\n> Start with the chapters you find hardest. Let the streak do the rest.",
      assets: [
        { label: "Start chapter-wise PYQs", url: `${SITE}/pyq` },
        { label: "See chapter-wise weightage", url: `${SITE}/neet/chapter-wise-weightage` },
      ],
      audience: aud("neet", "Dropper"),
    },
  },
  {
    key: "class-12",
    emoji: "🎓",
    category: "By class",
    title: "Class 12: boards + NEET",
    tagline: "Shows how PYQs connect school and NEET.",
    sendWhen: "Anytime, best near term exams",
    tint: "#DCEAFB",
    campaign: {
      name: "Class 12 — boards + NEET",
      subject: "Boards and NEET together? Start with PYQs",
      message:
        "# Boards and NEET don't have to compete\n\nHi {{name}},\n\nNCERT is the base for both. PYQs show you **how NEET turns NCERT lines into questions**, so your school study and NEET prep help each other.\n\n- Practise chapter by chapter, alongside school\n- Read in-depth solutions\n- 10 minutes a day is enough to start\n\n> Pick the chapter you studied today and solve five PYQs from it.",
      assets: [{ label: "Practise by chapter", url: `${SITE}/pyq` }],
      audience: aud("neet", "12th"),
    },
  },
  {
    key: "class-11",
    emoji: "🌱",
    category: "By class",
    title: "Class 11: start early",
    tagline: "Gets younger students into the habit early.",
    sendWhen: "Anytime",
    tint: "#CDF0DD",
    campaign: {
      name: "Class 11 — start early",
      subject: "{{name}}, an early start is a big edge",
      message:
        "# You don't have to finish the syllabus first\n\nHi {{name}},\n\nSeeing real PYQs while you study a chapter shows you **what actually matters in it**.\n\nAfter each chapter in school or coaching, solve a few of its PYQs on Edurack. It's free, and the habit you build now will carry you through Class 12.\n\n> Start with the chapter you're studying this week.",
      assets: [{ label: "Try chapter-wise PYQs", url: `${SITE}/pyq` }],
      audience: aud("neet", "11th"),
    },
  },
  {
    key: "comeback",
    emoji: "💌",
    category: "Growth",
    title: "We saved your spot",
    tagline: "Friendly nudge for students who went quiet.",
    sendWhen: "2+ weeks after they last visited",
    tint: "#F8D9C6",
    campaign: {
      name: "We saved your spot",
      subject: "{{name}}, your NEET prep is waiting",
      message:
        "# Life gets busy. That's okay.\n\nHi {{name}},\n\nIf you haven't had time for practice lately, there's no pressure. Everything is still here for you, free.\n\n- Pick up with just **one question**\n- Your progress and revision list are saved\n- A new streak starts the moment you answer\n\n> One question today is a better restart than a perfect plan next week.",
      assets: [{ label: "Pick up where I left off", url: `${SITE}/pyq` }],
      audience: aud("neet"),
    },
  },
  {
    key: "refer-friend",
    emoji: "🤝",
    category: "Growth",
    title: "Share with a friend",
    tagline: "Asks happy students to spread the word.",
    sendWhen: "After a student has practised a bit",
    tint: "#F7ECC4",
    campaign: {
      name: "Share with a friend",
      subject: "{{name}}, know someone preparing for NEET?",
      message:
        "# Study better together\n\nHi {{name}},\n\nIf Edurack has helped your preparation, forward this email to a friend who is also preparing.\n\nStudying alongside someone makes it easier to stay consistent, and you can compare streaks.\n\n> The PYQ Blueprints and chapter-wise practice are free for everyone.",
      assets: [{ label: "Practice NEET PYQs", url: `${SITE}/pyq` }],
      audience: aud("neet"),
    },
  },
  {
    key: "jee-intro",
    emoji: "⚙️",
    category: "Welcome",
    title: "JEE welcome",
    tagline: "Introduces free JEE practice.",
    sendWhen: "First email to JEE students",
    tint: "#DCEAFB",
    campaign: {
      name: "JEE welcome",
      subject: "{{name}}, free JEE PYQ practice on Edurack",
      message:
        "# Free JEE practice, starting today\n\nHi {{name}}, welcome to Edurack!\n\n- JEE previous year questions, chapter by chapter\n- A free test series\n- A daily streak so revision doesn't pile up\n\n> It's free, so there's nothing to lose by trying one question.",
      assets: [{ label: "Start practising", url: `${SITE}/dashboard` }],
      audience: aud("jee"),
    },
  },
  {
    key: "announcement",
    emoji: "✨",
    category: "Growth",
    title: "New feature announcement",
    tagline: "A clean layout for telling students what's new.",
    sendWhen: "When you ship something",
    tint: "#C9EEE8",
    campaign: {
      name: "New feature announcement",
      subject: "New on Edurack: [feature name] ✨",
      message:
        "# New: [feature name]\n\nHi {{name}},\n\nWe just added **[feature name]** to Edurack. [One sentence on what it does.]\n\n- [Benefit one]\n- [Benefit two]\n- [Benefit three]\n\n> [A short line telling them what to try first.]",
      assets: [{ label: "Try it now", url: `${SITE}/dashboard` }],
      audience: aud("neet"),
    },
  },
];

const hasBlanks = (t: OutreachTemplate) => /\[[^\]]+\]/.test(t.campaign.subject + t.campaign.message);

/** Full library: the original starter set + the extended ones. Keys must be unique (checked in tests/). */
export const OUTREACH_TEMPLATES: OutreachTemplate[] = [...CORE_TEMPLATES, ...TEMPLATES_A, ...TEMPLATES_B, ...TEMPLATES_C].map((t) => ({ ...t, needsEdit: t.needsEdit ?? hasBlanks(t) }));

export const BLANK_CAMPAIGN: Omit<OutreachCampaign, "id" | "lastSentAt"> = {
  name: "",
  subject: "",
  message: "# Your headline\n\nHi {{name}},\n\nWrite your message here.",
  assets: [],
  audience: { exam: "neet", track: "any", nonBuyersOnly: false },
};
