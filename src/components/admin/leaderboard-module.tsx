// Admin → Student of the week. Shows last week's (or this week's) top solvers with the details the
// team needs to reach out, and publishes a shout-out for one of them. Only students who opted in to
// appear can be featured, and the public shout-out uses their nickname, never their real name.
import { useCallback, useEffect, useState } from "react";
import { adminFeatureStudent, adminGetLeaderboard, adminSetLeaderboardHidden, adminUnfeatureStudent, type AdminLeaderboard, type Candidate } from "@/server-functions/leaderboard";
import type { Week } from "@/lib/leaderboard";

type AdminUser = { getIdToken: () => Promise<string> };

const draftFor = (c: Candidate) => `${c.displayName} solved ${c.solved} PYQs this week at ${c.accuracy}% accuracy, one new question at a time. Great learning. Keep it going!`;

export function LeaderboardModule({ adminUser }: { adminUser: AdminUser }) {
  const [week, setWeek] = useState<Week>("last");
  const [data, setData] = useState<AdminLeaderboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await adminGetLeaderboard({ data: { token: await adminUser.getIdToken(), week } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load.");
    } finally {
      setBusy(false);
    }
  }, [adminUser, week]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: (token: string) => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn(await adminUser.getIdToken());
      setDrafting(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold text-foreground">Student of the week</h2>
        {(["last", "current"] as Week[]).map((w) => (
          <button key={w} type="button" onClick={() => setWeek(w)} aria-pressed={week === w} className={`rounded-full px-4 py-1.5 text-xs font-bold ${week === w ? "bg-foreground text-background" : "border border-border text-foreground/70"}`}>
            {w === "last" ? "Last week" : "This week so far"}
          </button>
        ))}
        {data && <span className="text-xs text-foreground/55">{data.weekLabel}</span>}
        {busy && <span className="text-xs text-foreground/45">Loading…</span>}
      </div>

      {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</p>}

      {data?.featured && (
        <div className="clay p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">Published · {data.featured.weekLabel}</p>
          <p className="mt-1 font-display text-lg font-bold">{data.featured.displayName}</p>
          <p className="mt-1 text-sm text-foreground/75">{data.featured.message}</p>
          <button type="button" disabled={busy} onClick={() => void run((token) => adminUnfeatureStudent({ data: { token, weekKey: data.featured!.weekKey } }))} className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-bold text-foreground/70">Unpublish</button>
        </div>
      )}

      <div className="clay overflow-x-auto p-5">
        <p className="mb-3 text-xs text-foreground/55">Ranked students (15+ different questions, 40%+ accuracy). To feature someone who hasn't opted in, ask them to turn on "Show me" at /leaderboard first.</p>
        {data && data.candidates.length === 0 ? (
          <p className="text-sm text-foreground/55">No eligible students for this week.</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-foreground/45">
                <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Student</th><th className="py-2 pr-3">Solved</th><th className="py-2 pr-3">Accuracy</th><th className="py-2 pr-3">Board</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.candidates.map((c) => (
                <tr key={c.uid} className="border-t border-border align-top">
                  <td className="py-2.5 pr-3 text-foreground/50">{c.rank}</td>
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-foreground">{c.fullName || "(no name saved)"}</p>
                    <p className="text-xs text-foreground/50">{c.email}</p>
                  </td>
                  <td className="py-2.5 pr-3 font-bold">{c.solved}<span className="font-normal text-foreground/45"> / {c.attempted}</span></td>
                  <td className="py-2.5 pr-3">{c.accuracy}%</td>
                  <td className="py-2.5 pr-3 text-xs">
                    {c.hidden ? <span className="font-semibold text-red-600">Hidden</span> : c.optedIn ? <span className="font-semibold text-green-700">“{c.displayName}”</span> : <span className="text-foreground/45">Not opted in</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {c.optedIn && !c.hidden && (
                        <button type="button" disabled={busy} onClick={() => { setDrafting(c.uid); setMessage(draftFor(c)); }} className="rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">Feature</button>
                      )}
                      {(c.optedIn || c.hidden) && (
                        <button type="button" disabled={busy} onClick={() => void run((token) => adminSetLeaderboardHidden({ data: { token, uid: c.uid, hidden: !c.hidden } }))} className="rounded-full border border-border px-3 py-1 text-xs font-bold text-foreground/70">{c.hidden ? "Unhide" : "Hide"}</button>
                      )}
                    </div>
                    {drafting === c.uid && (
                      <div className="mt-2 text-left">
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} rows={3} className="w-full rounded-xl border border-border bg-background p-2 text-xs" aria-label="Shout-out message" />
                        <div className="mt-1.5 flex gap-2">
                          <button type="button" disabled={busy} onClick={() => void run((token) => adminFeatureStudent({ data: { token, week, uid: c.uid, message } }))} className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Publish shout-out</button>
                          <button type="button" onClick={() => setDrafting(null)} className="text-xs font-semibold text-foreground/60">Cancel</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
