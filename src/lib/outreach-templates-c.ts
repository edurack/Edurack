// Extended library, part C: Community · Updates · Sales · Support · Motivation · Hinglish · Growth.
import { A, T } from "@/lib/outreach-template-kit";

export const TEMPLATES_C = [
  // ───────────── Community ─────────────
  T("Community", "refer-batchmates", "🤝", "Study better together", "Referral ask framed around studying with friends.", "After a student has practised a few times",
    "{{name}}, bring a friend and keep each other going",
    `# Streaks are easier with a friend

Hi {{name}},

Students who prepare with a friend stay consistent far longer.

- Share Edurack with one batchmate
- Compare streaks and push each other

> Forward this email or send them the link below.`,
    [["Share Edurack", "/"]]),

  T("Community", "share-pdfs", "📤", "Share these PDFs with a friend", "Encourages sharing of your free PDFs.", "After sending PDFs",
    "{{name}}, know someone who'd want these PDFs?",
    `# Pass it on

Hi {{name}},

If the PYQ PDFs helped you, a friend preparing for the same exam will thank you for sharing them.

> They can download the same PDFs from the link below.`,
    [["Get the PDFs", "/blog"]]),

  T("Community", "testimonial-ask", "💬", "Share your story", "Asks happy students for a testimonial.", "After a student reaches a milestone",
    "{{name}}, would you share your Edurack experience?",
    `# We'd love to hear from you

Hi {{name}},

You've been consistent, and that's worth celebrating. If Edurack has helped, we'd be grateful for a couple of lines about your experience.

> Just reply to this email. Tell us what's working and what could be better.`,
    []),

  T("Community", "follow-us", "📱", "Follow us for daily tips", "Grows your social following.", "Anytime",
    "{{name}}, daily NEET tips on our channels",
    `# Stay in the loop

Hi {{name}},

We share study tips, strategy and updates on our social channels.

- [Your Instagram handle]
- [Your YouTube channel]

> Follow along so you never miss a tip.`,
    []),

  T("Community", "student-spotlight", "🌟", "Student spotlight", "Features a student's story.", "Monthly",
    "How [student name] stays consistent",
    `# Student spotlight: [student name]

Hi {{name}},

[Student name] has been practising on Edurack for [duration].

> "[A short quote from the student.]"

- Their daily routine: [routine]
- Their biggest lesson: [lesson]

Want to be featured next? Reply and tell us your story.`,
    [["Keep practising", "/pyq"]]),

  T("Community", "leaderboard-style", "🏁", "Monthly consistency recap", "A monthly recap that rewards consistency.", "Start of the month",
    "{{name}}, your month on Edurack",
    `# Last month's recap

Hi {{name}},

A new month is a fresh start for your preparation.

- Check how many days you practised
- Look at which chapters improved
- Set one target for this month

> Open your dashboard to see your numbers.`,
    [["View my dashboard", "/dashboard"]]),

  // ───────────── Updates ─────────────
  T("Updates", "new-pdfs", "📑", "New PDFs added", "Announces new downloadable resources.", "When you add PDFs",
    "{{name}}, new PDFs are up: [pdf name]",
    `# New resources

Hi {{name}},

We've added **[pdf name]**.

- [What's inside]
- [Who it's for]

> Download it now and add it to your revision.`,
    [["Download the PDFs", "/blog"]]),

  T("Updates", "new-questions", "➕", "New questions added", "Announces more practice content.", "When you add questions",
    "{{name}}, we've added [number] new questions",
    `# More to practise

Hi {{name}},

New questions are live for **[subject or chapters]**.

> Try a few now and see how they go.`,
    [["Practise now", "/pyq"]]),

  T("Updates", "feature-notebook", "📓", "Feature: your notebook", "Highlights the mistakes notebook.", "Anytime",
    "{{name}}, did you know your mistakes are saved?",
    `# Your personal revision notebook

Hi {{name}},

Every question you get wrong is saved to your notebook, so you can revisit exactly what you need.

- Filter by subject and chapter
- Re-attempt until you've got it

> Open it after your next practice session.`,
    [["Open my notebook", "/notebook"]]),

  T("Updates", "feature-drills", "⚡", "Feature: timed drills", "Highlights timed drills.", "Anytime",
    "{{name}}, practise under exam pressure",
    `# Timed drills

Hi {{name}},

Knowing the answer isn't enough. You need to find it on time.

- Short timed sets from your chosen chapters
- A score and review after each one

> Try one today.`,
    [["Try a timed drill", "/pyq-drill"]]),

  T("Updates", "maintenance", "🛠️", "Planned maintenance", "Warns students of downtime.", "Before planned downtime",
    "Edurack maintenance on [date]",
    `# Short maintenance window

Hi {{name}},

Edurack will be briefly unavailable on **[date]** from **[start time]** to **[end time]** for maintenance.

> Your progress and streak are safe. Plan your practice around it.`,
    []),

  T("Updates", "outage-apology", "🙏", "Sorry for the disruption", "Apology after an outage.", "After an incident",
    "{{name}}, sorry for the disruption",
    `# We're sorry

Hi {{name}},

Edurack had an issue on **[date]** that [short description of what happened]. It's now fixed.

> Your data and streak were not affected. [Adjust if streaks were protected or restored.]`,
    [["Back to practice", "/pyq"]]),

  T("Updates", "terms-update", "📜", "Policy update", "Notifies students of terms or privacy changes.", "When policies change",
    "An update to our terms and privacy policy",
    `# Policy update

Hi {{name}},

We've updated our [terms / privacy policy], effective **[date]**.

- [What changed, in one line]
- [What it means for students]

> You can read the full details on our website.`,
    []),

  // ───────────── Sales ─────────────
  T("Sales", "course-launch", "🚀", "Course launch", "Announces a new paid course.", "At launch",
    "{{name}}, introducing [course name]",
    `# [Course name] is here

Hi {{name}},

We're launching **[course name]** for **[exam and class]**.

- [Key feature one]
- [Key feature two]
- [Key feature three]

> [Add price and enrolment details.]`,
    [["See details", "/dashboard"]], A("neet", "any", true)),

  T("Sales", "early-bird", "🐦", "Early-bird offer", "Limited-time early offer.", "Launch week",
    "{{name}}, early-bird price ends [date]",
    `# Early-bird pricing

Hi {{name}},

For a limited time, get **[offer]** on **[product]**.

- Ends on **[date]**
- [What's included]

> Lock it in before the price goes up.`,
    [["Claim the offer", "/dashboard"]], A("neet", "any", true)),

  T("Sales", "last-day-offer", "⏳", "Last day of the offer", "Final-day urgency email.", "Last day of an offer",
    "{{name}}, last day: [offer]",
    `# Ends tonight

Hi {{name}},

Today is the last day to get **[offer]** on **[product]**.

> After midnight the price returns to normal.`,
    [["Claim it now", "/dashboard"]], A("neet", "any", true)),

  T("Sales", "thanks-for-purchase", "🎉", "Thank you for purchasing", "Confirms and welcomes a buyer.", "After a purchase",
    "{{name}}, thank you! Here's how to get started",
    `# You're all set

Hi {{name}},

Thank you for choosing Edurack. Here's how to get the most out of **[product]**:

- Find it under your purchases
- [First thing to do]
- [Second thing to do]

> Questions? Just reply to this email.`,
    [["Open my purchases", "/purchases"]], A("any")),

  T("Sales", "why-paid", "💡", "What you get with the paid plan", "Explains the value of upgrading.", "To engaged free users",
    "{{name}}, here's what you unlock",
    `# Go further

Hi {{name}},

You've been practising consistently, and these extras can help you improve faster:

- [Benefit one]
- [Benefit two]
- [Benefit three]

> [Add price and a clear next step.]`,
    [["See what's included", "/dashboard"]], A("neet", "any", true)),

  // ───────────── Support ─────────────
  T("Support", "feedback-survey", "📝", "Quick feedback request", "Asks students how it's going.", "A few weeks after sign-up",
    "{{name}}, how are we doing?",
    `# One quick question

Hi {{name}},

What's the **one thing** we could improve to make Edurack more useful for your preparation?

> Just reply with a line or two. We read every reply.`,
    []),

  T("Support", "need-help", "🆘", "Need help? We're here", "Points students to support.", "Anytime",
    "{{name}}, stuck on something? We can help",
    `# We're here to help

Hi {{name}},

If something isn't working or you have a question:

- Check the help centre for quick answers
- Raise a ticket and our team will get back to you

> No question is too small.`,
    [["Help centre", "/help"], ["Raise a ticket", "/tickets"]], A("any")),

  T("Support", "report-wrong-question", "🚩", "Spotted a mistake? Tell us", "Invites students to report wrong questions.", "Anytime",
    "{{name}}, help us fix any wrong question",
    `# Found an error? Report it

Hi {{name}},

If a question or solution looks wrong to you, please tell us. Open the question and use the report option.

> Every report helps all students after you.`,
    [["Back to practice", "/pyq"]]),

  T("Support", "faq-pointer", "❓", "Common questions answered", "Sends students to the FAQ.", "Anytime",
    "{{name}}, answers to common questions",
    `# Quick answers

Hi {{name}},

Most questions about using Edurack are answered in our FAQ.

> Can't find yours? Contact us and we'll help.`,
    [["Read the FAQ", "/faq"], ["Contact us", "/contact"]], A("any")),

  // ───────────── Motivation ─────────────
  T("Motivation", "monday-reset", "📅", "Monday reset", "Start-of-week motivation with a goal.", "Monday morning",
    "{{name}}, set one goal for this week",
    `# New week, one goal

Hi {{name}},

Pick **one** clear target for the week, such as finishing a chapter's PYQs or keeping a 7-day streak.

> Write it down and start today.`,
    [["Start the week", "/pyq"]]),

  T("Motivation", "comparison-trap", "🚫", "Stop comparing", "Gentle reminder about not comparing progress.", "Anytime",
    "{{name}}, you're not behind",
    `# Compare with yesterday's you

Hi {{name}},

Other people's scores and hours can make you feel behind. They don't know your starting point.

> Ask only: did I improve compared with last week?`,
    [["One question today", "/pyq"]]),

  T("Motivation", "feeling-overwhelmed", "🫶", "Feeling overwhelmed?", "Supportive email for stress periods.", "Before exams or after a bad test",
    "{{name}}, it's okay to feel this way",
    `# Preparation is hard, and that's normal

Hi {{name}},

If you're feeling overwhelmed, you're not alone. Almost everyone preparing for these exams feels it at some point.

- Break the day into small, doable tasks
- Take real breaks, sleep and eat properly
- Talk to a friend, family member or teacher you trust

> If it feels like more than stress, please reach out to someone you trust or a professional. Your wellbeing matters more than any score.`,
    []),

  T("Motivation", "bad-test", "🌧️", "After a bad test", "Encouragement after a poor result.", "After a poor test",
    "{{name}}, one bad test doesn't define you",
    `# This is data, not a verdict

Hi {{name}},

A low score tells you exactly what to fix, and that's valuable.

- Find the 3 chapters that cost you most
- Review those questions in your notebook
- Re-test them this week

> Plenty of top scorers had tests like this. What they did next is what mattered.`,
    [["Open my notebook", "/notebook"]]),

  T("Motivation", "festival-wishes", "🪔", "Festival wishes", "Warm greeting for a festival, with a light study nudge.", "On a festival day",
    "Happy [festival], {{name}}!",
    `# Happy [festival]!

Hi {{name}},

Wishing you and your family a joyful [festival] from all of us at Edurack.

> Enjoy the day. When you're ready, a few questions will keep your streak warm.`,
    [["Keep my streak", "/pyq"]], A("any")),

  T("Motivation", "new-year", "🎆", "New Year", "New-year goal setting.", "Around 1 January",
    "{{name}}, make this your year",
    `# A new year, a clear goal

Hi {{name}},

New years are a good moment to decide what you want. Write down:

- Your target exam and score
- Your daily practice commitment
- One habit you'll drop and one you'll keep

> We'll be with you through every step.`,
    [["Start the year strong", "/pyq"]], A("any")),

  // ───────────── Hinglish ─────────────
  T("Hinglish", "hi-welcome", "👋", "Hinglish: Welcome", "Friendly Hinglish welcome message.", "First email, Hinglish audience",
    "{{name}}, Edurack mein aapka swagat hai!",
    `# Swagat hai, {{name}}!

Hi {{name}},

Edurack par aap **chapter-wise PYQs with solutions** practice kar sakte hain, daily streak bana sakte hain aur apni mistakes revise kar sakte hain.

- Roz 10 minute practice se shuru karein
- Galat answers notebook mein save ho jaate hain
- Streak se consistency banti hai

> Aaj hi 3 questions solve karke dekhiye.`,
    [["Practice shuru karein", "/pyq"]]),

  T("Hinglish", "hi-streak", "🔥", "Hinglish: Streak reminder", "Hinglish nudge to keep a streak.", "Evening",
    "{{name}}, aaj ka streak mat todna!",
    `# Aaj ka ek question baaki hai

Hi {{name}},

Aapki streak chal rahi hai, bas **ek question** solve karna hai aaj ke liye.

> Chhota sa effort, lekin streak bachi rahegi.`,
    [["Ek question solve karein", "/pyq"]]),

  T("Hinglish", "hi-tips", "💡", "Hinglish: 3 study tips", "Quick Hinglish study tips.", "Anytime",
    "{{name}}, NEET ke liye 3 simple tips",
    `# 3 simple tips

Hi {{name}},

- **NCERT pehle:** pehle NCERT padho, phir PYQs solve karo
- **Mistakes note karo:** galat questions dobara dekho
- **Roz thoda:** kam hi sahi, par roz practice karo

> Consistency hi sabse bada hathiyaar hai.`,
    [["Aaj ki practice", "/pyq"]]),

  T("Hinglish", "hi-comeback", "🌤️", "Hinglish: Wapas aao", "Hinglish win-back.", "After inactivity",
    "{{name}}, kaafi din ho gaye, wapas aaiye!",
    `# Wapas aaiye, bas ek question

Hi {{name}},

Kaafi din se practice nahi hui. Koi baat nahi. Aaj sirf **ek question** solve karke dobara shuru kijiye.

> Aapka notebook aur progress waise hi saved hai.`,
    [["Dobara shuru karein", "/pyq"]]),

  // ───────────── Growth ─────────────
  T("Growth", "pdf-delivery", "📥", "PDF delivery (one-tap)", "Short email that just delivers PDFs. Best for one-tap sends.", "When a student asks for resources",
    "{{name}}, here are your PDFs 📚",
    `# Your PDFs are ready

Hi {{name}},

As promised, here are the resources:

- [PDF one]
- [PDF two]

> Download them, then try three questions on Edurack to put them to use.`,
    [["Download PDFs", "/blog"], ["Practise PYQs", "/pyq"]]),

  // ───────────── Free resources (/free-resources) ─────────────
  T("Growth", "free-resources-launch", "🆓", "Free resources: announcement", "Tells every student about the open notes and PDF library. No login needed.", "First send, any audience",
    "{{name}}, free notes and PDFs, no login needed",
    `# Free notes and PDFs for your exam

Hi {{name}},

We've opened a free library at Edurack: **notes, previous year papers, formula sheets and study planners** for NEET, JEE, CUET and IPMAT.

- **No login, no payment.** Just open the page and download
- **Filter by exam and subject** to find what you need in seconds
- **New files added regularly**, so check back

> Pick one file today and use it. A PDF only helps once you open it.`,
    [["Browse free resources", "/free-resources"]], A("any")),

  T("Growth", "free-resources-neet", "🧬", "Free resources: NEET", "NEET-only version that links straight to the NEET filter.", "NEET students, any time",
    "{{name}}, free NEET notes and PYQ papers",
    `# Free NEET material, ready to download

Hi {{name}},

Here is where you can get NEET study material without logging in: **notes, previous year papers and formula sheets** for Physics, Chemistry and Biology.

- Open the NEET filter and pick your subject
- Download what you need, no sign-up required
- Then solve a few PYQs on Edurack to test what you read

> Reading notes is half the job. Solving questions from them is the other half.`,
    [["Open NEET resources", "/free-resources?exam=neet"], ["Practise NEET PYQs", "/pyq"]], A("neet")),

  T("Growth", "free-resources-jee", "⚙️", "Free resources: JEE", "JEE-only version that links straight to the JEE filter.", "JEE students, any time",
    "{{name}}, free JEE notes and previous year papers",
    `# Free JEE material, ready to download

Hi {{name}},

We have a free library for JEE: **chapter notes, previous year papers and quick-revision sheets**, and you don't need to log in to get them.

- Open the JEE filter and choose a category
- Download and start revising today
- New files are added regularly

> Keep a few of these saved on your phone for quick revision before a test.`,
    [["Open JEE resources", "/free-resources?exam=jee"]], A("jee")),

  T("Growth", "free-resources-new-files", "✨", "Free resources: new files added", "Repeat send when you've uploaded fresh material.", "After uploading new files",
    "{{name}}, new free study files are up",
    `# New files just added

Hi {{name}},

We've added fresh study material to the free library, covering **[what you added, e.g. NEET Biology notes and JEE formula sheets]**.

- Free for everyone, no login needed
- Use the exam filter to jump to yours

> Missed the earlier files? They're all still there.`,
    [["See what's new", "/free-resources"]], A("any")),

  T("Growth", "free-resources-share", "🤝", "Free resources: share with a friend", "Asks students to pass the library to classmates, which grows downloads.", "A few days after the announcement",
    "{{name}}, know someone preparing for NEET or JEE?",
    `# Share the free library with a friend

Hi {{name}},

If you found our free notes and PDFs useful, forward this email to a classmate who is preparing for NEET, JEE, CUET or IPMAT.

- Everything is free and needs no login
- It takes them under a minute to find their exam and download

> Preparing together is easier than preparing alone.`,
    [["Share this page", "/free-resources"]], A("any")),

  T("Growth", "callback-followup", "📞", "Follow-up after a callback request", "Follows up on a student who asked for a call.", "After a callback request",
    "{{name}}, following up on your request",
    `# Thanks for reaching out

Hi {{name}},

Thanks for asking us to get in touch. In the meantime, here's something useful: [short helpful tip or resource].

> If it's easier, just reply to this email and tell us a good time to talk.`,
    [["Open my dashboard", "/dashboard"]], A("any")),

  T("Growth", "survey-goal", "🎯", "Tell us your goal", "Collects target scores to personalise later.", "Early in the journey",
    "{{name}}, what's your target?",
    `# What are you aiming for?

Hi {{name}},

Reply with two things and we'll point you to the best way to use Edurack:

- Your target exam and score or rank
- The subject you find hardest

> We read every reply.`,
    []),
];
