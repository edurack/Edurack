// Extended library, part B: Exam countdown · Tests & results · Win-back · Live & mentors · Parents.
import { A, T } from "@/lib/outreach-template-kit";

export const TEMPLATES_B = [
  // ───────────── Exam countdown ─────────────
  T("Exam countdown", "countdown-100", "💯", "100 days to go", "Kicks off the final stretch.", "100 days before the exam",
    "{{name}}, 100 days. Make them count.",
    `# 100 days to go

Hi {{name}},

A hundred days is plenty if you use them well.

- Split the syllabus into 4 revision blocks
- Fix a daily PYQ target
- Plan one full-length test every week from now

> Write your plan down today.`,
    [["Start today's practice", "/pyq"]]),

  T("Exam countdown", "countdown-60", "⏱️", "60 days to go", "Shifts focus to testing and revision.", "60 days before the exam",
    "{{name}}, 60 days left: shift to testing",
    `# 60 days to go

Hi {{name}},

- Reduce new learning, increase revision
- Take regular timed tests and analyse each one
- Clear your error log chapter by chapter

> The goal now is fixing leaks, not adding topics.`,
    [["Timed drill", "/pyq-drill"], ["Open notebook", "/notebook"]]),

  T("Exam countdown", "countdown-30", "📆", "30 days to go", "Final-month focus plan.", "30 days before the exam",
    "{{name}}, the final 30 days",
    `# 30 days to go

Hi {{name}},

- Revise NCERT Biology line by line again
- Re-solve every question in your notebook
- Take timed tests at the same hour as the real exam

> Protect your sleep. A rested mind scores higher.`,
    [["Revise mistakes", "/notebook"]]),

  T("Exam countdown", "countdown-10", "🚨", "10 days to go", "Calm, practical last-week prep.", "10 days before the exam",
    "{{name}}, 10 days: calm and consistent",
    `# 10 days to go

Hi {{name}},

- No new topics
- Revise formulas, diagrams and your short notes
- Keep your daily question streak alive
- Sort out admit card, ID and exam-centre logistics

> You've done the work. Now protect it.`,
    [["Quick revision", "/notebook"]]),

  T("Exam countdown", "exam-day-before", "🌙", "The day before the exam", "Reassurance and a checklist.", "The evening before the exam",
    "{{name}}, tomorrow is the day. You're ready.",
    `# One day to go

Hi {{name}},

- Keep your documents ready tonight
- Do a light revision only, nothing new
- Eat well and sleep early

> You've put in months of effort. Trust it. All the best from all of us at Edurack.`,
    []),

  T("Exam countdown", "exam-week", "🗓️", "Exam week checklist", "Practical exam-week guidance.", "7 days before the exam",
    "{{name}}, your exam-week checklist",
    `# Exam week

Hi {{name}},

- Confirm your centre and travel time
- Pack documents the night before
- Practise a short timed set daily to stay sharp
- Keep your sleep schedule matched to the exam timing

> Calm preparation beats last-minute cramming.`,
    [["Short timed set", "/pyq-drill"]]),

  T("Exam countdown", "after-exam", "✅", "After the exam", "Warm follow-up after the paper.", "Day after the exam",
    "{{name}}, you did it. Now rest.",
    `# The exam is done

Hi {{name}},

Whatever the paper felt like, finishing it took real discipline. Take a couple of days to recover.

> Whatever comes next, we're glad to have been part of your preparation. [Add a line about what to do next.]`,
    []),

  // ───────────── Tests & results ─────────────
  T("Tests & results", "first-full-test", "📄", "Take your first full-length test", "Pushes students to attempt a full test.", "After 1 to 2 weeks of practice",
    "{{name}}, ready for your first full-length test?",
    `# Test yourself under real conditions

Hi {{name}},

Practice builds knowledge. A full-length test builds **exam temperament**.

- Sit for the whole test in one go
- Don't pause, don't check notes
- Analyse it properly afterwards

> Your first score isn't a verdict. It's your starting point.`,
    [["Open dashboard", "/dashboard"]]),

  T("Tests & results", "new-test-live", "🆕", "New test is live", "Announces a new test.", "When you publish a test",
    "New test live on Edurack: [test name]",
    `# [Test name] is live

Hi {{name}},

A new test is ready for you: **[test name]**.

- [Syllabus or pattern covered]
- [Duration and marking]

> Attempt it in one sitting and review your analysis after.`,
    [["Open dashboard", "/dashboard"]]),

  T("Tests & results", "analyse-result", "🔍", "Analyse your result", "Nudges students to review their test analysis.", "A day after a test",
    "{{name}}, the real learning is in the analysis",
    `# Don't just check your score

Hi {{name}},

After a test, spend more time on analysis than on the test itself.

- Which chapters cost you marks?
- Which mistakes were silly and avoidable?
- Which questions took too long?

> Add the wrong ones to your notebook and revisit them in 3 days.`,
    [["Open dashboard", "/dashboard"], ["Open notebook", "/notebook"]]),

  T("Tests & results", "score-plateau", "📉", "Stuck at the same score?", "Helps students break a plateau.", "When scores stop improving",
    "{{name}}, stuck on the same score? Try this",
    `# Plateaus have causes

Hi {{name}},

- If you keep losing marks to silly errors, slow down and check
- If concepts are the issue, revisit NCERT for those chapters
- If time is the issue, drill under timers

> Find the single biggest leak and fix only that this week.`,
    [["Timed drill", "/pyq-drill"]]),

  T("Tests & results", "test-series-intro", "🧪", "Test series introduction", "Introduces your test series.", "Anytime",
    "{{name}}, practise with the Edurack test series",
    `# Test series built for steady improvement

Hi {{name}},

- [Number] full-length tests
- Detailed analysis after each one
- Track your progress over time

> [Add price, offer or availability here.]`,
    [["See the tests", "/dashboard"]], A("neet", "any", true)),

  // ───────────── Win-back ─────────────
  T("Win-back", "inactive-7", "👋", "We haven't seen you in a week", "Gentle nudge after a week away.", "7 days of inactivity",
    "{{name}}, it's been a week",
    `# Come back for just one question

Hi {{name}},

It's been a few days since your last practice. No pressure. Just solve **one question** today and you're back.

> Small restarts are easier than big comebacks.`,
    [["Solve one question", "/pyq"]]),

  T("Win-back", "inactive-30", "🌤️", "A month away: we miss you", "Warm win-back for long-inactive students.", "30 days of inactivity",
    "{{name}}, your notebook is waiting",
    `# Still preparing? We're here.

Hi {{name}},

It's been a while. Your saved mistakes and progress are still here, exactly where you left them.

- Restart with 5 questions
- Clear a few old mistakes from your notebook

> Whenever you're ready.`,
    [["Open dashboard", "/dashboard"]]),

  T("Win-back", "whats-stopping-you", "💬", "What's stopping you?", "Invites students to tell you why they stopped.", "After long inactivity",
    "{{name}}, can we ask you something?",
    `# Help us help you

Hi {{name}},

We noticed you've been away and we'd like to understand why. Just reply to this email with one line:

- Too busy?
- Couldn't find what you needed?
- Something wasn't working?

> Every reply is read by a real person on our team.`,
    []),

  T("Win-back", "new-since-you-left", "🎁", "New since you left", "Shows what's new to lure back lapsed students.", "After long inactivity",
    "{{name}}, here's what's new on Edurack",
    `# A lot has changed

Hi {{name}},

Since your last visit we've added:

- [New feature or content one]
- [New feature or content two]
- [New feature or content three]

> Come take a look. We think you'll like it.`,
    [["See what's new", "/dashboard"]]),

  T("Win-back", "streak-lost-return", "🔥", "Start a fresh streak", "Re-engages after a long-lost streak.", "After a long streak breaks",
    "{{name}}, a new streak starts with one question",
    `# Day 1, again

Hi {{name}},

Your old streak is behind you. Start a new one today. You've done it before.

> One answered question. That's all.`,
    [["Start my streak", "/pyq"]]),

  // ───────────── Live & mentors ─────────────
  T("Live & mentors", "live-session-invite", "🎥", "Live session invite", "Invites students to a live session.", "1 to 2 days before a session",
    "{{name}}, join our live session: [topic]",
    `# Live session: [topic]

Hi {{name}},

You're invited to a live session with **[mentor name]**.

- **When:** [date and time]
- **Topic:** [topic]
- Bring your doubts

> Spots are limited. Join early.`,
    [["View my sessions", "/my-sessions"]]),

  T("Live & mentors", "session-reminder", "⏰", "Session starts soon", "Last-minute reminder for a live session.", "1 hour before a session",
    "{{name}}, starting soon: [session name]",
    `# Starting in one hour

Hi {{name}},

Your session **[session name]** starts at **[time]**. Open the link a few minutes early to be ready.

> See you there.`,
    [["Open my sessions", "/my-sessions"]]),

  T("Live & mentors", "doubt-session", "🙋", "Doubt-clearing session", "Promotes a doubt session.", "Before a doubt session",
    "{{name}}, bring your doubts: [date]",
    `# Doubt-clearing session

Hi {{name}},

We're hosting a doubt-clearing session on **[date]** for **[subject or chapter]**.

> Write down your toughest questions beforehand and we'll go through them.`,
    [["View my sessions", "/my-sessions"]]),

  T("Live & mentors", "meet-mentor", "🧑‍🏫", "Meet our mentors", "Introduces the mentor community.", "Anytime",
    "{{name}}, learn from students who've done it",
    `# Mentors who've been where you are

Hi {{name}},

Our mentors have cracked the exams you're preparing for and know exactly where students get stuck.

- Get strategy tips from people who've done it
- Ask about prep, balance and mistakes to avoid

> [Add how a student can book or attend a session.]`,
    [["View sessions", "/my-sessions"]]),

  T("Live & mentors", "become-mentor", "🌟", "Become an Edurack mentor", "Recruits qualified students as mentors.", "To toppers and college students",
    "{{name}}, share your experience as a mentor",
    `# Help the next batch

Hi {{name}},

If you've cleared the exam or are a strong performer, consider mentoring on Edurack.

- Share your strategy with students
- Build teaching and leadership experience

> Apply in a couple of minutes.`,
    [["Apply to be a mentor", "/join-mentor"]], A("any")),

  T("Live & mentors", "join-intern", "🧑‍💻", "Join our intern programme", "Recruits interns.", "When you're hiring interns",
    "{{name}}, intern with Edurack",
    `# Work on something students use

Hi {{name}},

We're looking for interns who want hands-on experience in education and growth.

- Real projects, real responsibility
- Certificate on completion

> Applications are open.`,
    [["Apply as an intern", "/join-intern"]], A("any")),

  // ───────────── Parents ─────────────
  T("Parents", "share-with-parents", "👨‍👩‍👧", "Share with your parents", "Gives students something to forward to parents.", "Anytime",
    "{{name}}, share this with your parents",
    `# A note for your parents

Hi {{name}},

If you'd like your parents to know what you're working on, here's a short summary you can forward:

- Edurack offers chapter-wise previous-year question practice with solutions
- Students build a daily practice streak and revise their mistakes
- Progress is visible on the student's dashboard

> Forward this email to anyone who'd like to know more.`,
    [["About Edurack", "/about"]]),

  T("Parents", "parents-intro", "🏠", "Introduction for parents", "Written for a parent reading it.", "When emailing a parent's address",
    "A short introduction to Edurack for parents",
    `# Hello, and thank you for reading

Edurack helps students preparing for competitive exams practise with previous-year questions, build daily consistency and learn from their mistakes.

- Chapter-wise practice with solutions
- A daily streak that builds routine
- Clear progress tracking

> You can read more or contact us with any questions.`,
    [["About us", "/about"], ["Contact us", "/contact"]], A("any")),
];
