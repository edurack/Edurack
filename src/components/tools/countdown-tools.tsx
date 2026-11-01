// Exam countdown + study planner for JEE Main 2027 and NEET UG 2027. All maths is client-side (lib/study-planner.ts).
// The JEE dates are NTA-official; the NEET date is NOT announced yet, so it is shown as a planning date and says so
// (lib/exam-dates.ts holds the facts, who published them and when they were last checked).
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { JEE_MAIN_2027, NEET_UG_2027, VERIFIED_ON, daysBetween, formatDateLong, todayIST } from "@/lib/exam-dates";
import { buildPlan, type PlannerExam } from "@/lib/study-planner";
import { Field, ShareButton, inputCls } from "@/components/tools/tool-shell";
import { cn } from "@/lib/utils";

type Choice = "s1" | "s2" | "plan" | "custom";
type Option = { key: Choice; label: string; sub?: string; date?: string };

const validISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`));
const rangeLabel = (a: string, b?: string) => (b ? `${formatDateLong(a)} to ${formatDateLong(b)}` : formatDateLong(a));

export function CountdownPlanner({ exam }: { exam: PlannerExam }) {
  const jee = exam === "jee";
  const [today, setToday] = useState(() => todayIST());
  useEffect(() => {
    setToday(todayIST());
    const t = setInterval(() => setToday(todayIST()), 30 * 60_000);
    return () => clearInterval(t);
  }, []);

  const options: Option[] = jee
    ? [
        { key: "s1", label: "Session 1", sub: "20 to 24 and 28 January 2027", date: JEE_MAIN_2027.session1.first },
        { key: "s2", label: "Session 2", sub: "2 to 7 April 2027", date: JEE_MAIN_2027.session2.first },
        { key: "custom", label: "My own date" },
      ]
    : [
        { key: "plan", label: "2 May 2027", sub: "Planning date, not official", date: NEET_UG_2027.planningDate },
        { key: "custom", label: "My own date" },
      ];

  const [choice, setChoice] = useState<Choice>(jee ? "s1" : "plan");
  const [custom, setCustom] = useState("");
  const [hours, setHours] = useState("6");
  const [done, setDone] = useState("30");

  const picked = options.find((o) => o.key === choice);
  const examDate = choice === "custom" ? (validISO(custom) ? custom : "") : (picked?.date ?? "");
  const daysLeft = examDate ? daysBetween(today, examDate) : null;
  const examName = jee ? "JEE Main 2027" : "NEET UG 2027";

  const plan = useMemo(() => {
    const h = Number(hours);
    const p = Number(done);
    if (!examDate || !Number.isFinite(h) || h <= 0 || !Number.isFinite(p)) return null;
    return buildPlan({ exam, today, examDate, hoursPerDay: h, syllabusDonePct: p });
  }, [exam, today, examDate, hours, done]);

  const choiceBtn = (o: Option) => (
    <button
      key={o.key}
      type="button"
      onClick={() => setChoice(o.key)}
      aria-pressed={choice === o.key}
      className={cn("min-h-11 rounded-2xl border px-4 py-2 text-left text-sm", choice === o.key ? "border-foreground bg-foreground text-background" : "border-border text-foreground/80 hover:border-foreground/40")}
    >
      <span className="block font-bold">{o.label}</span>
      {o.sub && <span className={cn("block text-xs", choice === o.key ? "text-background/70" : "text-foreground/55")}>{o.sub}</span>}
    </button>
  );

  const status = jee
    ? choice === "custom"
      ? "Your own date"
      : "Official date: NTA public notice of 24 October 2026"
    : choice === "custom"
      ? "Your own date"
      : "Planning date: NTA has not announced the date";

  return (
    <div>
      <div className="clay rounded-3xl p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-foreground/50">Count down to</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Exam date">
          {options.map(choiceBtn)}
        </div>
        {choice === "custom" && (
          <div className="mt-4 max-w-xs">
            <Field label="Exam date">
              <input type="date" value={custom} min={today} onChange={(e) => setCustom(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
        {!jee && choice !== "custom" && (
          <p className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-foreground/80">{NEET_UG_2027.note}</p>
        )}
      </div>

      <div className="mt-5" aria-live="polite">
        <div className="ink-section rounded-3xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">{examName}</p>
          {daysLeft === null ? (
            <p className="font-display mt-2 text-2xl font-extrabold">Pick a date to start the countdown</p>
          ) : daysLeft < 0 ? (
            <p className="font-display mt-2 text-2xl font-extrabold">That date has passed</p>
          ) : daysLeft === 0 ? (
            <p className="font-display mt-2 text-4xl font-extrabold">Exam day</p>
          ) : (
            <>
              <p className="font-display mt-2 text-6xl font-extrabold" suppressHydrationWarning>
                {daysLeft}
                <span className="text-2xl text-white/60"> day{daysLeft === 1 ? "" : "s"} to go</span>
              </p>
              <p className="mt-2 text-sm text-white/65" suppressHydrationWarning>
                About {Math.round((daysLeft / 7) * 10) / 10} weeks, until {formatDateLong(examDate)}.
              </p>
            </>
          )}
          <p className="mt-3 text-xs font-semibold text-white/55">{status}. Dates last checked {formatDateLong(VERIFIED_ON)}.</p>
          {daysLeft !== null && daysLeft > 0 && <ShareButton className="mt-4 !border-white/25 !text-white" text={`${daysLeft} days to ${examName}. Plan yours on Edurack:`} />}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-foreground">Your study plan</h2>
        <p className="mt-1 text-sm text-foreground/65">Tell us how you study and we split the days left into phases. It is a suggestion, not an official schedule.</p>
        <div className="clay mt-3 grid gap-4 rounded-3xl p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Hours you study a day" hint="Between 1 and 14.">
            <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} />
          </Field>
          <Field label={`Syllabus done: ${Number.isFinite(Number(done)) ? Math.round(Number(done)) : 0}%`} hint="Your honest estimate.">
            <input type="range" min={0} max={100} step={5} value={Number.isFinite(Number(done)) ? Number(done) : 0} onChange={(e) => setDone(e.target.value)} className="w-full" aria-label="Syllabus done, percent" />
          </Field>
        </div>

        {plan ? (
          <div className="mt-5 space-y-4">
            {plan.warnings.map((w) => (
              <p key={w} className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-foreground/80">
                {w}
              </p>
            ))}
            <ol className="space-y-3">
              {plan.phases.map((p, i) => (
                <li key={p.key} className="clay-inset rounded-2xl p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-foreground">
                      {i + 1}. {p.label}
                    </h3>
                    <span className="text-xs font-semibold text-foreground/55">
                      {p.days} day{p.days === 1 ? "" : "s"}: {rangeLabel(p.start, p.end)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground/75">{p.focus}</p>
                  {p.mocksPerWeek > 0 && <p className="mt-1 text-xs font-semibold text-foreground/55">Full-length mocks: about {p.mocksPerWeek} a week.</p>}
                </li>
              ))}
            </ol>
            <div className="clay-inset overflow-x-auto rounded-2xl">
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Share of study time</th>
                    <th className="px-4 py-3">Hours a week</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.subjects.map((s) => (
                    <tr key={s.subject} className="border-t border-border">
                      <td className="px-4 py-3 font-bold text-foreground">{s.subject}</td>
                      <td className="px-4 py-3 text-foreground/80">{s.sharePct}%</td>
                      <td className="px-4 py-3 text-foreground/80">{s.hoursPerWeek}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-foreground/50">
              {jee ? "The split follows the marks: JEE Main has equal marks for Physics, Chemistry and Maths." : "The split follows the marks NEET UG has carried in recent years: Biology 360, Physics 180, Chemistry 180."} Hours a week assume {plan.hoursPerWeek} hours of study, every day of the week.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-foreground/60">Pick a future exam date and enter your daily hours to see a plan.</p>
        )}
      </section>

      {jee && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-foreground">JEE Main 2027 key dates</h2>
          <p className="mt-1 text-sm text-foreground/65">From NTA's public notice and Information Bulletin of 24 October 2026. Confirm on {JEE_MAIN_2027.site}.</p>
          <ul className="clay-inset mt-3 divide-y divide-border rounded-2xl">
            {JEE_MAIN_2027.events.map((e) => (
              <li key={e.label + e.date} className={cn("flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm", daysBetween(today, e.endDate ?? e.date) < 0 && "opacity-50")}>
                <span className="font-semibold text-foreground">{e.label}</span>
                <span className="text-foreground/70">{rangeLabel(e.date, e.endDate)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ink-section mt-8 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-extrabold">Turn the plan into practice</p>
          <p className="mt-1 text-sm text-white/65">Free {jee ? "JEE" : "NEET"} previous year questions with solutions, chapter by chapter.</p>
        </div>
        <Link to="/pyq" search={{ exam } as never} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#ffffff] px-6 text-sm font-extrabold text-[#141b2b]">
          Practise {jee ? "JEE" : "NEET"} PYQs
        </Link>
      </div>
    </div>
  );
}
