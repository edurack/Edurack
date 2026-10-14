// Starting points for a new blog post, shown when an admin clicks "New post".
// Pure data. The body uses only syntax blog-content.tsx already renders:
// ## headings, **bold**, - lists, > quotes, :::tip callouts, [button:Label](url).
import type { BlogPostInput } from "@/lib/blog-types";

export const EMPTY_BLOG_FORM: BlogPostInput = {
  title: "",
  slug: "",
  excerpt: "",
  category: "platformUpdates",
  tags: [],
  examKey: null,
  track: null,
  coverImageUrl: null,
  coverImageAlt: "",
  bodyMarkdown: "",
  author: { name: "Edurack Team", photoUrl: null, bio: null, mentorId: null },
  pinned: false,
  relatedBundleId: null,
  relatedBatchId: null,
  documents: [],
  seoTitleOverride: null,
  seoDescriptionOverride: null,
  substantiveUpdate: false,
};

export type BlogStarter = {
  key: string;
  emoji: string;
  title: string;
  blurb: string;
  tint: string;
  form: Partial<BlogPostInput>;
};

export const BLOG_STARTERS: BlogStarter[] = [
  {
    key: "blank",
    emoji: "📝",
    title: "Blank post",
    blurb: "Start from an empty page.",
    tint: "#E4E9F1",
    form: {},
  },
  {
    key: "strategy",
    emoji: "🧭",
    title: "Strategy guide",
    blurb: "A how-to for scoring more, with steps and a call to action.",
    tint: "#DCEAFB",
    form: {
      category: "neetStrategy",
      examKey: "neet" as BlogPostInput["examKey"],
      tags: ["strategy", "NEET"],
      bodyMarkdown:
        "## Why this matters\n\nOne or two sentences on the problem students face, and what they'll be able to do after reading.\n\n## The plan\n\n- **Step 1:** what to do first\n- **Step 2:** what to do next\n- **Step 3:** how to check you're on track\n\n:::tip Quick tip\nOne short, practical tip students can use today.\n:::\n\n## Common mistakes\n\n1. Mistake one, and how to avoid it\n2. Mistake two, and how to avoid it\n\n## Start today\n\nSolve a few real PYQs on the chapter you just studied.\n\n[button:Practise free PYQs](https://www.edurack.in/pyq)\n",
    },
  },
  {
    key: "pyq",
    emoji: "📚",
    title: "PYQ resource + PDF",
    blurb: "Announce a PDF or PYQ pack. Attach the file under Files.",
    tint: "#CDF0DD",
    form: {
      category: "neetStrategy",
      examKey: "neet" as BlogPostInput["examKey"],
      tags: ["PYQ", "PDF", "NEET"],
      bodyMarkdown:
        "## What's inside\n\nA short description of the resource and who it's for.\n\n- Subject-wise and chapter-wise coverage\n- Years covered: 2020–26\n- Solutions included\n\n## How to use it\n\n1. Download the PDF below (login required)\n2. Pick your weakest chapter first\n3. Practise the same chapter on Edurack\n\n:::important Free for students\nEverything here is free. Log in to download.\n:::\n\n[button:Practise on Edurack](https://www.edurack.in/pyq)\n",
    },
  },
  {
    key: "news",
    emoji: "📰",
    title: "Exam news",
    blurb: "Dates, notices and what students should do about them.",
    tint: "#F7ECC4",
    form: {
      category: "examNews",
      tags: ["exam news"],
      substantiveUpdate: false,
      bodyMarkdown:
        "## What happened\n\nState the news in two sentences, with the source and date.\n\n## What it means for you\n\n- Point one\n- Point two\n\n:::warning Check the official site\nAlways confirm dates on the official exam website.\n:::\n\n## What to do now\n\nOne clear action students should take this week.\n",
    },
  },
  {
    key: "mentor",
    emoji: "🎓",
    title: "Mentor story",
    blurb: "A mentor's journey, advice and lessons.",
    tint: "#F8D9C6",
    form: {
      category: "mentorStories",
      tags: ["mentor", "story"],
      bodyMarkdown:
        "## Who they are\n\nA short intro to the mentor and their result.\n\n## Their preparation in three lines\n\n- How they studied\n- What they'd do differently\n- The habit that made the biggest difference\n\n> A memorable quote from the mentor.\n\n## Advice for you\n\nThree practical tips students can start using today.\n",
    },
  },
  {
    key: "update",
    emoji: "✨",
    title: "Platform update",
    blurb: "Tell students what's new on Edurack.",
    tint: "#C9EEE8",
    form: {
      category: "platformUpdates",
      tags: ["update", "new feature"],
      bodyMarkdown:
        "## What's new\n\nOne sentence on the feature and why it helps students.\n\n- Benefit one\n- Benefit two\n- Benefit three\n\n## How to try it\n\n1. Log in to your dashboard\n2. Open the new feature\n3. Tell us what you think\n\n[button:Open Edurack](https://www.edurack.in/dashboard)\n",
    },
  },
];
