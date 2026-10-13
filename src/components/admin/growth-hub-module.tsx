// Admin → Growth Hub. One page for whoever owns marketing: are we getting students,
// are they practising, where do they drop off, and what to do about it today.
import { useCallback, useEffect, useState } from "react";
import { getGrowthSnapshot } from "@/server-functions/growth";
import type { GrowthSnapshot } from "@/lib/growth-types";

type AdminUser = { getIdToken: () => Promise<string> };

const n = (x: number) => x.toLocaleString("en-IN");
const short = (day: string) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-tight text-foreground">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-foreground/50"}`}>{sub}</p>}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="clay p-5">
      <div className="mb-4"><h3 className="font-display text-sm font-bold text-foreground">{title}</h3>{hint && <p className="text-xs text-foreground/45">{hint}</p>}</div>
      {children}
    </div>
  );
}

function Bars({ data, color, labelEvery = 5 }: { data: { day: string; v: number }[]; color: string; labelEvery?: number }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.day} title={`${short(d.day)}: ${d.v}`} className="flex h-full flex-1 flex-col justify-end">
            <div className="w-full rounded-t-md" style={{ height: `${Math.max(d.v ? 4 : 1.5, (d.v / max) * 100)}%`, background: color, opacity: d.v ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => <span key={d.day} className="flex flex-1 justify-center">{i % labelEvery === 0 && <span className="whitespace-nowrap text-[9px] text-foreground/40">{short(d.day)}</span>}</span>)}
      </div>
    </div>
  );
}

function HBars({ rows, color }: { rows: { label: string; n: number; sub?: string }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="text-sm text-foreground/45">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label + (r.sub ?? "")}>
          <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-foreground">{r.label}{r.sub && <span className="text-foreground/40"> · {r.sub}</span>}</span><span className="shrink-0 font-semibold text-foreground">{n(r.n)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.n / max) * 100)}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function GrowthHubModule({ adminUser, onNavigate }: { adminUser: AdminUser; onNavigate?: (tab: string) => void }) {
  const [s, setS] = useState<GrowthSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setS(await getGrowthSnapshot({ data: { token: await adminUser.getIdToken() } })); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, [adminUser]);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>;
  if (!s) return <div className="space-y-3"><div className="clay-inset h-24 animate-pulse rounded-2xl" /><div className="clay-inset h-64 animate-pulse rounded-2xl" /></div>;

  const delta = s.totals.prev7d ? Math.round(((s.totals.new7d - s.totals.prev7d) / s.totals.prev7d) * 100) : null;
  const activation = s.totals.students ? Math.round((s.funnel[1].n / s.totals.students) * 100) : 0;

  // Rule-based "what to do today" — turns the numbers into a next move.
  const moves: { icon: string; text: string; cta?: string }[] = [];
  if (s.neverPracticed > 0) moves.push({ icon: "⚡", text: `${n(s.neverPracticed)} student${s.neverPracticed === 1 ? "" : "s"} signed up but never answered a question. Send the "Solve your first question" template.`, cta: "Open Outreach" });
  if (s.streaks.atRisk > 0) moves.push({ icon: "🔥", text: `${n(s.streaks.atRisk)} streak${s.streaks.atRisk === 1 ? " is" : "s are"} at risk today. Automatic reminders go out at each student's usual practice time.` });
  if (delta !== null && delta < 0) moves.push({ icon: "📉", text: `Signups are down ${Math.abs(delta)}% vs last week. Share the PYQ PDFs in Telegram/WhatsApp groups and ask mentors to post.` });
  if (activation < 40 && s.totals.students > 20) moves.push({ icon: "🎯", text: `Only ${activation}% of signups ever answer a question. The first-question email and a shorter first screen are your best levers.`, cta: "Open Outreach" });
  if (s.outreach.sent7d === 0) moves.push({ icon: "📬", text: "No emails went out this week. Send one template to a small group to keep students warm.", cta: "Open Outreach" });
  if (moves.length === 0) moves.push({ icon: "✅", text: "Nothing urgent. Keep the weekly routine: one email, one social post, one mentor check-in." });

  const maxF = Math.max(1, s.funnel[0].n);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Growth Hub</h1>
          <p className="mt-1 text-sm text-foreground/60">Are we getting students, are they practising, and what should we do today?</p>
        </div>
        <button type="button" onClick={load} disabled={busy} className="clay-btn-ghost px-4 py-2 text-sm disabled:opacity-50">{busy ? "Refreshing…" : `↻ Refresh · ${new Date(s.generatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}`}</button>
      </div>

      {/* today's moves */}
      <div className="mb-6 rounded-3xl border border-primary/25 bg-accent/60 p-5">
        <p className="mb-3 font-display text-sm font-bold text-foreground">🧭 What to do today</p>
        <ul className="space-y-2.5">
          {moves.map((m, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 text-sm text-foreground">
              <span className="text-lg">{m.icon}</span><span className="min-w-0 flex-1">{m.text}</span>
              {m.cta && onNavigate && <button type="button" onClick={() => onNavigate("outreach")} className="clay-btn px-4 py-1.5 text-xs">{m.cta} →</button>}
            </li>
          ))}
        </ul>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Students" value={n(s.totals.students)} sub={`+${n(s.totals.new30d)} in 30 days`} />
        <Kpi label="New this week" value={n(s.totals.new7d)} sub={delta === null ? `${n(s.totals.new1d)} today` : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs last week`} tone={delta === null ? undefined : delta >= 0 ? "good" : "bad"} />
        <Kpi label="Active today" value={n(s.active.dau)} sub="answered in last 24 h" />
        <Kpi label="Active this week" value={n(s.active.wau)} sub={s.totals.students ? `${Math.round((s.active.wau / s.totals.students) * 100)}% of students` : undefined} />
        <Kpi label="Answered (7d)" value={n(s.answered7d)} sub={s.accuracy7d === null ? undefined : `${s.accuracy7d}% correct`} />
        <Kpi label="Streaks today" value={n(s.streaks.doneToday)} sub={`${n(s.streaks.atRisk)} at risk`} tone={s.streaks.atRisk > 0 ? "bad" : undefined} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Signups · last 30 days" hint="New student accounts per day (IST)"><Bars data={s.signups.map((d) => ({ day: d.day, v: d.n }))} color="#4F8FE0" /></Card>
        <Card title="Practice · last 14 days" hint="Questions answered per day"><Bars data={s.activity.map((d) => ({ day: d.day, v: d.answered }))} color="#3FB27F" labelEvery={2} /></Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Where students drop off" hint={`${activation}% of signups answer at least one question`}>
          <ul className="space-y-3">
            {s.funnel.map((f, i) => {
              const prev = i === 0 ? null : s.funnel[i - 1].n;
              const conv = prev ? Math.round((f.n / prev) * 100) : null;
              return (
                <li key={f.label}>
                  <div className="flex items-center justify-between text-xs"><span className="font-semibold text-foreground">{f.label}</span><span className="text-foreground/60"><strong className="text-foreground">{n(f.n)}</strong>{conv !== null && <span className="ml-1.5 text-foreground/45">({conv}% of previous)</span>}</span></div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (f.n / maxF) * 100)}%`, opacity: 1 - i * 0.18 }} /></div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-foreground/45">Best streak ever: {s.streaks.best} days · never practised: {n(s.neverPracticed)}</p>
        </Card>

        <Card title="Who our students are" hint="By target exam and class">
          <div className="grid gap-5 sm:grid-cols-2">
            <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-foreground/45">Exam</p><HBars rows={s.segments.exam} color="#4F8FE0" /></div>
            <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-foreground/45">Class</p><HBars rows={s.segments.track} color="#E0A24F" /></div>
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="Top subjects · 7 days" hint="By questions answered"><HBars rows={s.subjects7d.map((x) => ({ label: x.label, n: x.n }))} color="#3FB27F" /></Card>
        <Card title="Top chapters · 7 days" hint="What students practise most"><HBars rows={s.chapters7d.map((x) => ({ label: x.label, sub: x.subject, n: x.n }))} color="#9B7FE0" /></Card>
        <Card title="Email outreach" hint="From the Outreach tab">
          <p className="font-display text-3xl font-bold text-foreground">{n(s.outreach.sent7d)}</p>
          <p className="text-xs text-foreground/50">emails sent in the last 7 days · {s.outreach.campaigns} saved campaign{s.outreach.campaigns === 1 ? "" : "s"}</p>
          {onNavigate && <button type="button" onClick={() => onNavigate("outreach")} className="clay-btn mt-4 px-4 py-2 text-xs">Open Outreach →</button>}
        </Card>
      </div>

      <p className="text-xs text-foreground/40">
        Practice numbers are counted from {s.eventsSince ? new Date(s.eventsSince).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "when tracking started"}, so earlier activity isn't included. Signups and streak counts cover all time.
      </p>
    </div>
  );
}
