// Student drawer section: exactly what this student solved + their streak/reminder state
// + a one-tap "send campaign to this student".
import { useEffect, useState } from "react";
import { getAdminStudentPracticeActivity, type StudentPracticeActivity } from "@/server-functions/student-practice-activity";
import { listOutreachCampaigns, sendOutreachToStudent } from "@/server-functions/outreach";
import type { OutreachCampaign } from "@/lib/outreach-types";

type AdminUser = { getIdToken: () => Promise<string> };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST" : "—");
const OUTCOME = { correct: ["✓", "text-green-600"], wrong: ["✗", "text-red-500"], revealed: ["👁", "text-foreground/40"] } as const;

export function StudentPracticeActivity({ uid, adminUser }: { uid: string; adminUser: AdminUser }) {
  const [data, setData] = useState<StudentPracticeActivity | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [pick, setPick] = useState("");
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await adminUser.getIdToken();
        const [a, c] = await Promise.all([getAdminStudentPracticeActivity({ data: { token, uid } }), listOutreachCampaigns({ data: { token } })]);
        setData(a);
        setCampaigns(c.campaigns);
        setPick(c.campaigns[0]?.id ?? "");
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [uid, adminUser]);

  if (err) return <p className="text-sm text-red-500">{err}</p>;
  if (!data) return <div className="clay-inset h-20 animate-pulse rounded-2xl" />;

  const maxDay = Math.max(1, ...data.days.map((d) => d.answered + d.revealed));
  const rows = showAll ? data.recent : data.recent.slice(0, 15);

  return (
    <div className="space-y-4">
      <div className="clay-inset px-3.5 py-3 text-sm text-foreground">
        <p><strong>Last solved:</strong> {fmt(data.lastPracticedAt)}</p>
        <p><strong>Streak:</strong> {data.streak.current}d {data.streak.doneToday ? "· done today ✓" : data.streak.alive ? "· ⚠ at risk — nothing answered yet today" : "· broken"}</p>
        <p className="text-foreground/60"><strong>Auto-reminder goes at:</strong> {data.reminder.usualTimeIst} (their last practice time){data.reminder.lastSent ? ` · last sent ${data.reminder.lastSent.day} (${data.reminder.lastSent.status})` : " · none sent yet"}</p>
        {data.approximate && <p className="mt-1 text-xs text-amber-600">History starts after the tracking patch was deployed; older activity below shows each question's latest state only.</p>}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Last 14 days (answered)</p>
        <div className="flex h-16 items-end gap-1">
          {data.days.map((d) => (
            <div key={d.day} title={`${d.day}: ${d.answered} answered, ${d.correct} correct, ${d.revealed} peeked`} className="flex flex-1 flex-col justify-end">
              <div className="rounded-sm bg-primary/70" style={{ height: `${Math.max(d.answered ? 6 : 2, (d.answered / maxDay) * 100)}%`, opacity: d.answered ? 1 : 0.25 }} />
              <span className="mt-0.5 text-center text-[9px] text-foreground/40">{d.answered || ""}</span>
            </div>
          ))}
        </div>
      </div>

      {data.chapters.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Chapters practised</p>
          <ul className="space-y-1">
            {data.chapters.map((c) => (
              <li key={`${c.subject}|${c.chapter}`} className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span className="truncate">{c.subject} · {c.chapter}</span>
                <span className="shrink-0 text-foreground/60">{c.correct}/{c.attempted} · {c.accuracy}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Questions solved (newest first)</p>
        {rows.length === 0 ? <p className="text-sm text-foreground/60">Nothing solved yet.</p> : (
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={`${r.questionId}-${i}`} className="clay-inset px-3 py-2 text-xs text-foreground">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className={`mr-1.5 font-bold ${OUTCOME[r.outcome][1]}`}>{OUTCOME[r.outcome][0]}</span><strong>{r.subject}</strong> · {r.chapter}{r.topic ? ` · ${r.topic}` : ""}{r.year ? ` · ${r.year}` : ""}</span>
                  <span className="shrink-0 text-foreground/45">{fmt(r.at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-foreground/60">{r.snippet}</p>
                {r.outcome !== "revealed" && <p className="mt-0.5 text-foreground/50">Answered <strong>{r.answer ?? "—"}</strong>{r.outcome === "wrong" && r.correctAnswer != null ? <> · correct <strong>{r.correctAnswer}</strong></> : null}</p>}
                {r.outcome === "revealed" && <p className="mt-0.5 text-foreground/50">Only viewed the solution (doesn't count for the streak)</p>}
              </li>
            ))}
          </ul>
        )}
        {data.recent.length > 15 && <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${data.recent.length}`}</button>}
      </div>

      {data.drills.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Timed drills</p>
          <ul className="space-y-1">
            {data.drills.map((d, i) => (
              <li key={i} className="flex justify-between text-xs text-foreground">
                <span>{fmt(d.startedAt)}</span>
                <span>{d.submittedAt ? `${d.score}/${d.maxScore} · ${d.correct}✓ ${d.wrong}✗ ${d.skipped}– · ${d.timeTakenSec ? Math.round(d.timeTakenSec / 60) : "?"} min` : "not submitted"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="clay-inset flex flex-wrap items-center gap-2 px-3.5 py-3">
        <span className="text-xs font-semibold text-foreground/60">One-tap email:</span>
        <select className="clay-inset flex-1 rounded-xl px-3 py-1.5 text-xs text-foreground" value={pick} onChange={(e) => setPick(e.target.value)}>
          {campaigns.length === 0 && <option value="">No campaigns yet — create one in Outreach</option>}
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button" disabled={!pick}
          className="clay-btn rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-40"
          onClick={async () => {
            setSendMsg("Sending…");
            try { const r = await sendOutreachToStudent({ data: { token: await adminUser.getIdToken(), campaignId: pick, uid } }); setSendMsg(`Sent to ${r.email} ✓`); }
            catch (e) { setSendMsg((e as Error).message); }
          }}
        >Send ▶</button>
        {sendMsg && <span className="w-full text-xs text-foreground/60">{sendMsg}</span>}
      </div>
    </div>
  );
}
