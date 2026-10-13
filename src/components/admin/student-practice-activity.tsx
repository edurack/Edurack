// Student drawer section: what this student solved, how it went, streak + reminder state,
// and a one-tap "send a campaign to this student".
import { useEffect, useMemo, useState } from "react";
import { getAdminStudentPracticeActivity, type PracticeActivityRow, type StudentPracticeActivity } from "@/server-functions/student-practice-activity";
import { listOutreachCampaigns, sendOutreachToStudent } from "@/server-functions/outreach";
import type { OutreachCampaign } from "@/lib/outreach-types";

type AdminUser = { getIdToken: () => Promise<string> };

const IST = "Asia/Kolkata";
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: IST });
const weekday = (day: string) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", timeZone: IST }).slice(0, 1);

const SUBJECT_TINT: Record<string, string> = { Physics: "#DCEAFB", Chemistry: "#F7ECC4", Botany: "#CDF0DD", Zoology: "#F8D9C6", Biology: "#CDF0DD", Maths: "#E5DDF7", Mathematics: "#E5DDF7" };
const tint = (s: string) => SUBJECT_TINT[s] ?? "#E4E9F1";

const OUTCOME = {
  correct: { icon: "✓", label: "Correct", cls: "bg-green-100 text-green-800" },
  wrong: { icon: "✗", label: "Wrong", cls: "bg-red-100 text-red-700" },
  revealed: { icon: "👁", label: "Peeked", cls: "bg-secondary text-foreground/60" },
} as const;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="font-display text-xl font-bold leading-tight text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-foreground/45">{sub}</p>}
    </div>
  );
}

function Heading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">{children}</p>
      {right}
    </div>
  );
}

export function StudentPracticeActivity({ uid, adminUser }: { uid: string; adminUser: AdminUser }) {
  const [data, setData] = useState<StudentPracticeActivity | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [pick, setPick] = useState("");
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | PracticeActivityRow["outcome"]>("all");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await adminUser.getIdToken();
        const [a, c] = await Promise.all([getAdminStudentPracticeActivity({ data: { token, uid } }), listOutreachCampaigns({ data: { token } })]);
        setData(a); setCampaigns(c.campaigns); setPick(c.campaigns[0]?.id ?? "");
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [uid, adminUser]);

  const summary = useMemo(() => {
    if (!data) return null;
    const answered = data.days.reduce((a, d) => a + d.answered, 0);
    const correct = data.days.reduce((a, d) => a + d.correct, 0);
    const peeked = data.days.reduce((a, d) => a + d.revealed, 0);
    return { answered, correct, peeked, activeDays: data.days.filter((d) => d.answered > 0).length, accuracy: answered ? Math.round((correct / answered) * 100) : null };
  }, [data]);

  if (err) return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>;
  if (!data || !summary) return <div className="space-y-3"><div className="clay-inset h-28 animate-pulse rounded-2xl" /><div className="clay-inset h-24 animate-pulse rounded-2xl" /></div>;

  const { streak } = data;
  const status = streak.doneToday
    ? { label: "Done today", cls: "bg-green-100 text-green-800", dot: "bg-green-500" }
    : streak.alive
      ? { label: "At risk", cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" }
      : { label: streak.current > 0 ? "Broken" : "No streak", cls: "bg-secondary text-foreground/60", dot: "bg-foreground/30" };

  const maxDay = Math.max(1, ...data.days.map((d) => d.answered + d.revealed));
  const today = todayIst();
  const counts = { all: data.recent.length, correct: data.recent.filter((r) => r.outcome === "correct").length, wrong: data.recent.filter((r) => r.outcome === "wrong").length, revealed: data.recent.filter((r) => r.outcome === "revealed").length };
  const filtered = data.recent.filter((r) => filter === "all" || r.outcome === filter);
  const rows = showAll ? filtered : filtered.slice(0, 12);

  return (
    <div className="space-y-5">
      {/* streak hero */}
      <div className="flex items-center gap-4 rounded-3xl border border-border bg-gradient-to-br from-[#FBE9DD] to-[#FFF6EC] p-4 dark:from-secondary dark:to-secondary">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-4 ring-[#F8D9C6]">
          <div className="text-center leading-none">
            <p className="text-xl">🔥</p>
            <p className="font-display text-2xl font-extrabold text-[#1F2333]">{streak.current}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>
            <span className="text-xs text-[#1F2333]/60">best {streak.longest}d</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-[#1F2333]">Last solved {ago(data.lastPracticedAt)}</p>
          <p className="text-xs text-[#1F2333]/60">{data.lastPracticedAt ? `${fmt(data.lastPracticedAt)} IST` : "Hasn't answered a question yet"}</p>
        </div>
      </div>

      {/* reminder */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3">
        <span className="text-lg">⏰</span>
        <div className="text-xs text-foreground/70">
          <p><strong className="text-foreground">Streak reminder goes out around {data.reminder.usualTimeIst} IST</strong>, the time they usually practise, only if their streak is alive and they haven't answered yet that day.</p>
          <p className="mt-0.5 text-foreground/50">{data.reminder.lastSent ? `Last sent ${data.reminder.lastSent.day} (${data.reminder.lastSent.status}).` : "No reminder sent yet."}</p>
        </div>
      </div>
      {data.approximate && <p className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">Detailed history starts when tracking was deployed. Older activity below shows each question's latest state only.</p>}

      {/* tiles */}
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Answered" value={String(summary.answered)} sub="last 14 days" />
        <Tile label="Accuracy" value={summary.accuracy === null ? "—" : `${summary.accuracy}%`} sub={`${summary.correct} correct`} />
        <Tile label="Active" value={`${summary.activeDays}/14`} sub="days" />
        <Tile label="Peeked" value={String(summary.peeked)} sub="solutions" />
      </div>

      {/* 14-day chart */}
      <div>
        <Heading>Last 14 days</Heading>
        <div className="flex h-20 items-end gap-1.5 rounded-2xl border border-border bg-background px-3 pb-2 pt-3">
          {data.days.map((d) => {
            const h = ((d.answered + d.revealed) / maxDay) * 100;
            return (
              <div key={d.day} title={`${d.day}: ${d.answered} answered, ${d.correct} correct, ${d.wrong} wrong, ${d.revealed} peeked`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex w-full flex-col justify-end overflow-hidden rounded-md" style={{ height: `${Math.max(d.answered + d.revealed ? 8 : 3, h)}%` }}>
                  {d.revealed > 0 && <div className="bg-foreground/15" style={{ flex: d.revealed }} />}
                  {d.wrong > 0 && <div className="bg-red-400" style={{ flex: d.wrong }} />}
                  {d.correct > 0 && <div className="bg-green-500" style={{ flex: d.correct }} />}
                  {d.answered + d.revealed === 0 && <div className="h-full bg-foreground/10" />}
                </div>
                <span className={`text-[9px] ${d.day === today ? "font-bold text-primary" : "text-foreground/40"}`}>{weekday(d.day)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-3 text-[10px] text-foreground/50">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500" />correct</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />wrong</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-foreground/15" />peeked</span>
        </div>
      </div>

      {/* chapters */}
      {data.chapters.length > 0 && (
        <div>
          <Heading>Chapter accuracy</Heading>
          <ul className="space-y-2.5 rounded-2xl border border-border bg-background px-4 py-3">
            {data.chapters.map((c) => (
              <li key={`${c.subject}|${c.chapter}`}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-foreground"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: tint(c.subject), outline: "1px solid rgba(0,0,0,.12)" }} />{c.chapter} <span className="text-foreground/40">· {c.subject}</span></span>
                  <span className="shrink-0 font-semibold text-foreground">{c.accuracy}% <span className="font-normal text-foreground/45">({c.correct}/{c.attempted})</span></span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className={`h-full rounded-full ${c.accuracy >= 70 ? "bg-green-500" : c.accuracy >= 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.max(3, c.accuracy)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* questions */}
      <div>
        <Heading>What they solved</Heading>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([["all", "All"], ["correct", "✓ Correct"], ["wrong", "✗ Wrong"], ["revealed", "👁 Peeked"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setFilter(k); setShowAll(false); }} className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${filter === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground/65 hover:border-foreground/40"}`}>{l} · {counts[k]}</button>
          ))}
        </div>
        {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground/50">{data.recent.length === 0 ? "Nothing solved yet." : "Nothing in this filter."}</p> : (
          <ul className="space-y-2">
            {rows.map((r, i) => {
              const o = OUTCOME[r.outcome];
              return (
                <li key={`${r.questionId}-${i}`} className="overflow-hidden rounded-2xl border border-border bg-background">
                  <div className="flex">
                    <div className="w-1.5 shrink-0" style={{ background: tint(r.subject) }} />
                    <div className="min-w-0 flex-1 px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full px-2 py-0.5 font-bold text-[#1F2333]" style={{ background: tint(r.subject) }}>{r.subject}</span>
                          <span className="truncate font-semibold text-foreground">{r.chapter}</span>
                          {r.topic && <span className="text-foreground/50">· {r.topic}</span>}
                          {r.year && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-foreground/60">{r.year}</span>}
                        </div>
                        <span className="text-[11px] text-foreground/40">{fmt(r.at)}</span>
                      </div>
                      {r.snippet && <p className="mt-1.5 line-clamp-2 text-xs text-foreground/60">{r.snippet}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${o.cls}`}>{o.icon} {o.label}</span>
                        {r.outcome !== "revealed" && <span className="text-foreground/60">They chose <strong className="text-foreground">{r.answer ?? "—"}</strong></span>}
                        {r.outcome === "wrong" && r.correctAnswer != null && <span className="text-foreground/60">· right answer <strong className="text-green-700">{r.correctAnswer}</strong></span>}
                        {r.outcome === "revealed" && <span className="text-foreground/50">Only viewed the solution (doesn't count for the streak)</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > 12 && <button type="button" className="mt-3 text-xs font-bold text-primary" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${filtered.length}`}</button>}
      </div>

      {/* drills */}
      {data.drills.length > 0 && (
        <div>
          <Heading>Timed drills</Heading>
          <ul className="space-y-2">
            {data.drills.map((d, i) => {
              const pct = d.submittedAt && d.maxScore ? Math.round(((d.score ?? 0) / d.maxScore) * 100) : null;
              return (
                <li key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-xs">
                  <div>
                    <p className="font-semibold text-foreground">{fmt(d.startedAt)}</p>
                    <p className="text-foreground/50">{d.submittedAt ? `${d.correct}✓ ${d.wrong}✗ ${d.skipped}– · ${d.timeTakenSec ? Math.round(d.timeTakenSec / 60) : "?"} min` : "Not submitted"}</p>
                  </div>
                  {pct !== null ? <span className={`rounded-full px-3 py-1 text-sm font-bold ${pct >= 70 ? "bg-green-100 text-green-800" : pct >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>{d.score}/{d.maxScore}</span> : <span className="text-foreground/40">—</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* one-tap email */}
      <div className="rounded-3xl border border-primary/25 bg-accent/60 p-4">
        <p className="font-display text-sm font-bold text-foreground">✉️ Send this student an email</p>
        <p className="mb-3 text-xs text-foreground/55">One tap. Uses a saved campaign; they won't get the same one twice.</p>
        <div className="flex flex-wrap gap-2">
          <select className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground" value={pick} onChange={(e) => setPick(e.target.value)}>
            {campaigns.length === 0 && <option value="">No campaigns yet — create one in Outreach</option>}
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            type="button" disabled={!pick || sendMsg?.text === "Sending…"}
            className="clay-btn px-5 py-2 text-xs disabled:opacity-40"
            onClick={async () => {
              setSendMsg({ ok: true, text: "Sending…" });
              try { const r = await sendOutreachToStudent({ data: { token: await adminUser.getIdToken(), campaignId: pick, uid } }); setSendMsg({ ok: true, text: `Sent to ${r.email} ✓` }); }
              catch (e) { setSendMsg({ ok: false, text: (e as Error).message }); }
            }}
          >Send ▶</button>
        </div>
        {sendMsg && <p className={`mt-2 text-xs ${sendMsg.ok ? "text-green-700" : "text-red-600"}`}>{sendMsg.text}</p>}
      </div>
    </div>
  );
}
