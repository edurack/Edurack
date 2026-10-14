// Extended library, part A: Welcome · Habit · Strategy · By exam · By class.
// Formatting: "# headline", "**bold**", "- list", "> callout", {{name}}, [blank to fill in].
import { A, T } from "@/lib/outreach-template-kit";

export const TEMPLATES_A = [
  // ───────────── Welcome ─────────────
  T("Welcome", "welcome-3-steps", "🧭", "Welcome: 3 steps to start", "A clear first-day checklist so new sign-ups don't stall.", "Day 0 after sign-up",
    "{{name}}, 3 steps to get started on Edurack",
    `# Three steps and you're in

Hi {{name}}, welcome aboard.

Here is the fastest way to get value in your first 10 minutes:

- **Step 1:** Solve 3 PYQs from a chapter you already know
- **Step 2:** Check the solution for any you got wrong
- **Step 3:** Come back tomorrow to start your streak

> Small and daily beats big and rare. Just begin.`,
    [["Solve my first 3 PYQs", "/pyq"]]),

  T("Welcome", "welcome-neet-class12", "🎓", "Welcome: NEET, Class 12", "Welcome tuned to boards-plus-NEET students.", "First email to 12th students",
    "{{name}}, NEET prep that fits around your boards",
    `# NEET prep that works with your boards

Hi {{name}}, welcome to Edurack.

You are juggling school and NEET, so we keep it simple: **short daily PYQ practice with solutions**, and a streak that keeps you consistent without eating your day.

- 15 minutes a day is enough to start
- NCERT-based chapters first, extras later
- Your mistakes are saved so you can revise them

> Start with one chapter you are weak in.`,
    [["Start practising", "/pyq"]], A("neet", "12th")),

  T("Welcome", "welcome-neet-class11", "🌱", "Welcome: NEET, Class 11", "Gentle start for early starters.", "First email to 11th students",
    "{{name}}, starting NEET early is your biggest advantage",
    `# You are early, and that's an advantage

Hi {{name}}, welcome to Edurack.

Class 11 is where NEET is really decided. Students who build the habit now don't panic later.

- Pick **one chapter a week** and finish its PYQs
- Read NCERT first, then test yourself
- Keep a daily streak, even if it is 5 questions

> Consistency in Class 11 is worth more than cramming in Class 12.`,
    [["Try chapter-wise PYQs", "/pyq"]], A("neet", "11th")),

  T("Welcome", "welcome-dropper", "🔁", "Welcome: droppers", "Respectful, practical welcome for repeat attempters.", "First email to droppers",
    "{{name}}, a fresh plan for this attempt",
    `# A fresh plan for this attempt

Hi {{name}}, welcome to Edurack.

You already know the syllabus. What changes the result now is **accuracy, revision and consistency**.

- Find which chapters cost you marks, using PYQ weightage
- Practise by chapter, and re-attempt every mistake
- Hold a daily streak so a bad day doesn't become a bad week

> This attempt is about fixing leaks, not starting over.`,
    [["See chapter-wise weightage", "/neet/chapter-wise-weightage"], ["Start practising", "/pyq"]], A("neet", "Dropper")),

  T("Welcome", "welcome-cuet", "📝", "Welcome: CUET", "Introduces Edurack to CUET aspirants.", "First email to CUET students",
    "{{name}}, practice for CUET on Edurack",
    `# Practice that matches how CUET tests you

Hi {{name}}, welcome to Edurack.

CUET rewards speed and accuracy across your chosen subjects. Regular timed practice is the best way to build both.

- Practise in short timed sets
- Review every wrong answer the same day
- Build a daily streak so revision never piles up

> Start with your strongest subject to build momentum, then move to the weaker one.`,
    [["Open my dashboard", "/dashboard"]], A("cuet")),

  T("Welcome", "welcome-ipmat", "💼", "Welcome: IPMAT", "Introduces Edurack to IPMAT aspirants.", "First email to IPMAT students",
    "{{name}}, your IPMAT prep starts here",
    `# Build IPMAT-ready habits

Hi {{name}}, welcome to Edurack.

IPMAT is won on steady quant and verbal practice over months, not weeks.

- A little quant every day
- Reading practice you can actually stick to
- A streak that keeps you honest

> Pick one topic today and do ten questions on it.`,
    [["Open my dashboard", "/dashboard"]], A("ipmat")),

  T("Welcome", "complete-profile", "👤", "Complete your profile", "Nudges students to fill in class and target exam.", "3 days after sign-up",
    "{{name}}, finish your profile in 30 seconds",
    `# One quick thing

Hi {{name}},

Your profile helps us show the **right questions and updates** for your exam and class.

- Add your target exam
- Add your class or drop year

> It takes about 30 seconds.`,
    [["Update my profile", "/profile"]]),

  T("Welcome", "platform-tour", "🗺️", "Platform tour", "Shows where everything lives.", "Day 2 after sign-up",
    "{{name}}, a quick tour of Edurack",
    `# Everything in one place

Hi {{name}}, here is what you can do on Edurack:

- **PYQ practice:** chapter-wise questions with solutions
- **Timed drills:** practise under exam pressure
- **Notebook:** your mistakes saved for revision
- **Dashboard:** your streak and progress

> Open the notebook after your next practice session. That is where improvement happens.`,
    [["Open dashboard", "/dashboard"], ["Open my notebook", "/notebook"]]),

  // ───────────── Habit ─────────────
  T("Habit", "streak-7", "🔥", "7-day streak celebration", "Reinforces a first-week streak.", "When a student hits 7 days",
    "{{name}}, 7 days in a row. That's real.",
    `# A full week. Nicely done.

Hi {{name}},

Seven days of practice is where habits start to stick. Most people never get here.

> Now aim for **14**. Don't aim for perfect days, aim for showing up.`,
    [["Keep the streak going", "/pyq"]]),

  T("Habit", "streak-30", "🏆", "30-day streak celebration", "Celebrates a month of consistency.", "When a student hits 30 days",
    "{{name}}, 30 days. You're in the top tier of consistency.",
    `# 30 days of showing up

Hi {{name}},

A month of daily practice is serious discipline. Whatever your target rank, you've already proven something to yourself.

- Revisit your notebook and clear old mistakes
- Try a timed drill to test your speed

> Keep going. The next 30 days compound on these.`,
    [["Try a timed drill", "/pyq-drill"], ["Revise my mistakes", "/notebook"]]),

  T("Habit", "streak-broken", "💔", "Your streak broke, restart today", "Kind, no-guilt restart after a broken streak.", "The day after a streak breaks",
    "{{name}}, restart today. Day 1 starts now.",
    `# Streaks break. Restarting is the skill.

Hi {{name}},

Your streak ended, and that's okay. What matters is the next question you solve.

> One question today starts a new streak. That's all it takes.`,
    [["Solve one question", "/pyq"]]),

  T("Habit", "daily-10-min", "⏱️", "The 10-minute daily plan", "A tiny routine that is easy to keep.", "Anytime",
    "{{name}}, just 10 minutes a day",
    `# 10 minutes, every day

Hi {{name}},

Can't find hours? Find ten minutes.

- **3 min:** pick a chapter
- **5 min:** solve 5 PYQs
- **2 min:** read solutions to the ones you missed

> Do it at the same time each day so it becomes automatic.`,
    [["Start my 10 minutes", "/pyq"]]),

  T("Habit", "weekend-challenge", "🎯", "Weekend challenge", "Gives students a specific goal for the weekend.", "Friday evening",
    "{{name}}, your weekend challenge",
    `# This weekend: 30 questions

Hi {{name}},

Here is a simple challenge. Solve **30 PYQs** across Saturday and Sunday, from any chapters you choose.

- 15 on Saturday, 15 on Sunday
- Re-read every solution you got wrong

> Reply with how it went. We'd love to hear.`,
    [["Start the challenge", "/pyq"]]),

  T("Habit", "morning-routine", "🌅", "Morning practice routine", "Encourages practice before the day gets busy.", "Early morning (7–8 AM)",
    "{{name}}, start your morning with 5 questions",
    `# Win the morning

Hi {{name}},

Five questions before school or coaching. That's the habit.

- Your brain is fresh in the morning
- It protects your streak before the day gets busy

> Do it before checking your phone for anything else.`,
    [["Solve 5 questions", "/pyq"]]),

  T("Habit", "night-revision", "🌙", "Night revision nudge", "Evening reminder to revise mistakes.", "8–9 PM",
    "{{name}}, 10 minutes of revision before bed",
    `# Revise before you sleep

Hi {{name}},

What you review just before sleep sticks better. Open your notebook and go through today's mistakes.

> Ten minutes tonight saves an hour later.`,
    [["Open my notebook", "/notebook"]]),

  T("Habit", "no-zero-days", "0️⃣", "No zero days", "Philosophy email: do something every day.", "Anytime",
    "{{name}}, never have a zero day",
    `# The no-zero-days rule

Hi {{name}},

Some days you won't feel like studying. On those days, do the **minimum**: one question. Just one.

- It keeps the habit alive
- It often turns into more

> A streak is a chain of tiny decisions. Make today's.`,
    [["Do my one question", "/pyq"]]),

  // ───────────── Strategy ─────────────
  T("Strategy", "biology-360", "🧬", "Biology is 360 marks", "Reminds students where half the marks are.", "Anytime",
    "{{name}}, half your NEET marks are in Biology",
    `# 360 of 720 marks

Hi {{name}},

Botany and Zoology together carry **90 questions, which is 360 marks**. That is half the paper.

- NCERT line-by-line is non-negotiable
- Solve PYQs chapter-wise to spot repeated concepts
- Revise diagrams and tables regularly

> Strong Biology is the most reliable way to move your score.`,
    [["Practise Biology PYQs", "/pyq"], ["See weightage", "/neet/chapter-wise-weightage"]]),

  T("Strategy", "physics-approach", "⚛️", "Physics: how to approach it", "Practical physics prep advice.", "Anytime",
    "{{name}}, how to make Physics less scary",
    `# Physics is a skill, not a subject to memorise

Hi {{name}},

Physics improves with **solving, not reading**.

- Learn each formula's meaning, not just its shape
- Solve PYQs from one chapter until patterns appear
- Keep a mistakes list and re-solve those questions

> Do a few numericals daily. Speed comes from repetition.`,
    [["Practise Physics PYQs", "/pyq"]]),

  T("Strategy", "chemistry-split", "⚗️", "Chemistry: three parts, three plans", "Splits Chemistry into physical, organic, inorganic.", "Anytime",
    "{{name}}, one Chemistry plan won't fit all three parts",
    `# Chemistry has three personalities

Hi {{name}},

- **Physical:** practise numericals, formulas become automatic
- **Organic:** understand mechanisms, don't memorise reactions
- **Inorganic:** NCERT repetition and short notes

> Rotate daily between the three so none gets neglected.`,
    [["Practise Chemistry PYQs", "/pyq"]]),

  T("Strategy", "ncert-first", "📖", "NCERT first", "Reinforces NCERT as the base.", "Anytime",
    "{{name}}, finish NCERT before anything else",
    `# NCERT is the base

Hi {{name}},

Before extra books and tests, make sure NCERT is solid. NEET questions repeatedly come from it.

- Read each chapter fully, including diagrams and examples
- Then solve that chapter's PYQs to see how it's asked

> If a PYQ surprises you, go back to the NCERT line behind it.`,
    [["Chapter-wise PYQs", "/pyq"]]),

  T("Strategy", "negative-marking", "➖", "Handling negative marking", "Teaches smart guessing and skipping.", "Before mock season",
    "{{name}}, stop losing marks to guesses",
    `# Every wrong answer costs more than a skipped one

Hi {{name}},

In NEET, a correct answer gives +4 and a wrong one costs -1.

- Attempt questions you can eliminate down to two options
- Skip questions you cannot narrow down at all
- Track guess accuracy in your drills

> Smart skipping is a skill. Practise it.`,
    [["Try a timed drill", "/pyq-drill"]]),

  T("Strategy", "time-management", "⏳", "Time management in the paper", "Helps students plan their paper-solving order.", "Before mock tests",
    "{{name}}, how to pace the NEET paper",
    `# Don't let one question eat five minutes

Hi {{name}},

- Do your strongest subject first to bank confidence
- Set a rough time limit per question and move on when you hit it
- Leave the last minutes for marking or revisiting skipped questions

> Practise this in timed drills, not for the first time on exam day.`,
    [["Timed drill", "/pyq-drill"]]),

  T("Strategy", "error-log", "📒", "Keep an error log", "Pushes students to learn from mistakes.", "Anytime",
    "{{name}}, your mistakes are your best syllabus",
    `# Learn from every wrong answer

Hi {{name}},

Students who improve fastest do one thing: they **review mistakes**.

- Note why you got it wrong: concept, silly error, or time
- Revisit those questions after a few days
- Edurack saves them for you automatically

> Your notebook is a custom syllabus of exactly what you need.`,
    [["Open my notebook", "/notebook"]]),

  T("Strategy", "revision-cycle", "🔄", "The revision cycle", "Explains spaced revision simply.", "Anytime",
    "{{name}}, revise like this to remember more",
    `# See it again, just before you'd forget

Hi {{name}},

Reading once is not learning. Revisit topics at growing gaps:

- Next day
- After a week
- After a month

> Use your notebook to bring old mistakes back at the right time.`,
    [["Revise now", "/notebook"]]),

  T("Strategy", "pyq-how-to", "📚", "How to use PYQs properly", "Gets more value out of previous year questions.", "Anytime",
    "{{name}}, are you using PYQs the right way?",
    `# PYQs are a map of the exam

Hi {{name}},

- Do them chapter-wise, right after studying the chapter
- Notice which concepts repeat year after year
- Don't just check the answer, read the solution

> The goal isn't to finish PYQs. It's to understand what NEET keeps asking.`,
    [["Chapter-wise PYQs", "/pyq"], ["Weightage view", "/neet/chapter-wise-weightage"]]),

  T("Strategy", "high-weightage", "📊", "Focus on high-weightage chapters", "Targets effort where marks are.", "Anytime",
    "{{name}}, spend your time where the marks are",
    `# Not all chapters are equal

Hi {{name}},

Some chapters carry far more questions than others. Spending your time proportionally is the smartest shortcut there is.

> Check the chapter-wise weightage and start with the top five in your weakest subject.`,
    [["See weightage", "/neet/chapter-wise-weightage"]]),

  T("Strategy", "last-90", "📅", "Last 90 days plan", "A framework for the final quarter.", "About 90 days before the exam",
    "{{name}}, the last 90 days: here's a plan",
    `# 90 days to go

Hi {{name}},

- **Days 1 to 45:** finish revision of every chapter with PYQs
- **Days 46 to 75:** full-length tests and error-log revision
- **Days 76 to 90:** light revision, formulas, diagrams, rest

> Adjust it to your pace, but have a plan on paper.`,
    [["Start revising", "/pyq"]]),

  // ───────────── By exam ─────────────
  T("By exam", "jee-main-vs-adv", "⚙️", "JEE: Main first, Advanced next", "Helps JEE students prioritise.", "Anytime",
    "{{name}}, Main first, Advanced next",
    `# Sequence your JEE prep

Hi {{name}},

- Lock in Main-level fundamentals first
- Build speed and accuracy with PYQs
- Layer Advanced-level problem solving after

> Solid basics make Advanced far less intimidating.`,
    [["Practise PYQs", "/pyq"]], A("jee")),

  T("By exam", "jee-maths", "➗", "JEE: Maths practice habit", "Encourages daily maths problem solving.", "Anytime",
    "{{name}}, daily Maths is non-negotiable for JEE",
    `# Maths improves with volume

Hi {{name}},

- Solve a fixed number of problems every day
- Mark the ones you couldn't crack and return to them
- Notice your common slip-ups (signs, limits, algebra)

> Treat each wrong answer as a pattern to fix.`,
    [["Practise now", "/pyq"]], A("jee")),

  T("By exam", "jee-physics-chem", "🔬", "JEE: Physics and Chemistry balance", "Reminds students not to neglect Chemistry.", "Anytime",
    "{{name}}, Chemistry is the easiest rank booster",
    `# Don't skip Chemistry

Hi {{name}},

Many JEE students overinvest in Physics and Maths. Chemistry, especially with NCERT-based revision, is often the quickest way to add marks.

> Add 30 minutes of Chemistry daily and track your accuracy.`,
    [["Chemistry practice", "/pyq"]], A("jee")),

  T("By exam", "cuet-domain", "📘", "CUET: domain subject focus", "Reminds CUET students to prepare their domain subjects.", "Anytime",
    "{{name}}, your CUET domain subjects matter most",
    `# Know your domain subjects deeply

Hi {{name}},

- Cover the full syllabus of each chosen subject
- Practise timed sets, since speed is part of the test
- Review every incorrect answer

> Consistency across weeks beats a last-minute sprint.`,
    [["Open dashboard", "/dashboard"]], A("cuet")),

  T("By exam", "cuet-gt", "🧠", "CUET: General Test practice", "Prepares for the General Test section.", "Anytime",
    "{{name}}, don't ignore the General Test",
    `# A little daily practice goes a long way

Hi {{name}},

General Test marks are among the easiest to improve with regular practice.

- Mix reasoning, current affairs and quant
- Keep sessions short and frequent

> Ten questions a day for a month adds up.`,
    [["Open dashboard", "/dashboard"]], A("cuet")),

  T("By exam", "ipmat-quant", "🔢", "IPMAT: quant routine", "Builds a steady quant habit.", "Anytime",
    "{{name}}, build your IPMAT quant routine",
    `# Quant is built, not found

Hi {{name}},

- Fix a daily quant slot
- Rotate topics so nothing goes stale
- Time yourself, since accuracy under time is the test

> Track which topics you avoid. Those are your opportunities.`,
    [["Open dashboard", "/dashboard"]], A("ipmat")),

  T("By exam", "ipmat-verbal", "🗞️", "IPMAT: verbal and reading", "Encourages reading as a habit.", "Anytime",
    "{{name}}, 20 minutes of reading daily",
    `# Verbal improves with reading

Hi {{name}},

- Read one good article daily
- Note unfamiliar words and use them
- Practise reading comprehension under time

> Reading speed and comprehension grow slowly and permanently.`,
    [["Open dashboard", "/dashboard"]], A("ipmat")),

  // ───────────── By class ─────────────
  T("By class", "class11-ncert-habit", "📗", "Class 11: NCERT habit", "Early NCERT foundation.", "Anytime",
    "{{name}}, make NCERT a daily habit in Class 11",
    `# Build the base now

Hi {{name}},

- Read one NCERT chapter section daily
- Solve its PYQs the same day
- Revisit weak topics weekly

> NCERT repetition in Class 11 makes Class 12 feel lighter.`,
    [["Practise PYQs", "/pyq"]], A("neet", "11th")),

  T("By class", "class12-boards-neet", "⚖️", "Class 12: boards and NEET together", "Balancing both exams.", "Before board season",
    "{{name}}, boards and NEET don't have to compete",
    `# Overlap is your friend

Hi {{name}},

Much of the NEET syllabus overlaps with your boards.

- Study each chapter once, deeply
- Use PYQs to cover the NEET angle after
- Don't drop daily practice during board season. Keep it small.

> Even 5 questions a day protects your NEET momentum.`,
    [["Keep my streak", "/pyq"]], A("neet", "12th")),

  T("By class", "dropper-first-30", "🛠️", "Dropper: first 30 days", "A structured start for the drop year.", "Start of the drop year",
    "{{name}}, your first 30 days as a dropper",
    `# Set the foundation in 30 days

Hi {{name}},

- **Week 1:** diagnose using PYQs by chapter
- **Week 2 to 3:** fix the weakest high-weightage chapters
- **Week 4:** first timed drills and an error-log review

> A calm, consistent first month sets up the whole year.`,
    [["Weightage view", "/neet/chapter-wise-weightage"], ["Start practising", "/pyq"]], A("neet", "Dropper")),

  T("By class", "dropper-motivation", "💪", "Dropper: mid-year motivation", "Re-energises droppers when it gets long.", "Mid-year",
    "{{name}}, the middle of the year is the hardest part",
    `# Stay with it

Hi {{name}},

Months in, the excitement fades and the work remains. That is normal.

- Reduce the goal, not the habit: a small daily target
- Look at how far you've come in your notebook

> You don't need motivation every day. You need a routine.`,
    [["Back to practice", "/pyq"]], A("neet", "Dropper")),
];
