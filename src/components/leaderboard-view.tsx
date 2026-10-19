// Weekly PYQ leaderboard page + the "Student of the week" shout-out card.
// Students appear only by choice, under a nickname (see server-functions/leaderboard.ts).
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconLoader2 as Loader2, IconTrophy as Trophy } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { getStudentOfTheWeek, getWeeklyLeaderboard, saveLeaderboardPrefs, type LeaderboardPayload } from "@/server-functions/leaderboard";
import type { PublicFeatured } from "@/lib/leaderboard-server";
import type { Week } from "@/lib/leaderboard";

export function FeaturedCard({ f, className = "" }: { f: PublicFeatured; className?: string }) {
  return (
    <section className={`rounded-3xl border border-amber-300/60 bg-amber-50 p-5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-50 ${className}`} aria-label="Student of the week">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
        <Trophy className="h-4 w-4" aria-hidden /> Student of the week · {f.weekLabel}
      </div>
      <p className="font-display mt-2 text-xl font-extrabold">{f.displayName}</p>
      <p className="mt-1.5 text-sm leading-relaxed">{f.message}</p>
      <p className="mt-3 text-xs font-semibold opacity-75">
        {f.solved} PYQs solved · {f.accuracy}% accuracy
      </p>
    </section>
  );
}

/** For the student dashboard: shows the latest shout-out, or nothing at all. */
export function StudentOfTheWeekBanner() {
  const [f, setF] = useState<PublicFeatured | null>(null);
  useEffect(() => {
    let alive = true;
    getStudentOfTheWeek()
      .then((r) => alive && setF(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!f) return null;
  return (
    <div>
      <FeaturedCard f={f} />
      <Link to="/leaderboard" className="mt-2 inline-block text-sm font-bold text-primary hover:underline">
        See this week's leaderboard →
      </Link>
    </div>
  );
}

export function LeaderboardView() {
  const { user, loading } = useAuth();
  const [week, setWeek] = useState<Week>("current");
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(
    async (w: Week) => {
      if (!user) return;
      setErr(null);
      try {
        const r = await getWeeklyLeaderboard({ data: { token: await user.getIdToken(), week: w } });
        setData(r);
        setName((prev) => prev || r.me.displayName);
      } catch {
        setErr("Couldn't load the leaderboard. Please try again in a moment.");
      }
    },
    [user],
  );

  useEffect(() => {
    void load(week);
  }, [load, week]);

  const save = async (optIn: boolean) => {
    if (!user) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveLeaderboardPrefs({ data: { token: await user.getIdToken(), optIn, displayName: name } });
      setSaveMsg(optIn ? "You're on the leaderboard." : "You're off the leaderboard.");
      await load(week);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const me = data?.me;
  const status = !me
    ? ""
    : me.eligible
      ? me.optedIn
        ? `You're #${me.position} of ${data!.participants} on the board.`
        : `You'd be #${me.position} on the board. Turn on "Show me" below to appear.`
      : me.attemptsNeeded > 0
        ? `Answer ${me.attemptsNeeded} more question${me.attemptsNeeded === 1 ? "" : "s"} this week to be ranked.`
        : `Ranking needs ${data!.rules.minAccuracyPct}%+ accuracy. You're at ${me.accuracy}% so far.`;

  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Weekly PYQ leaderboard</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/75">
          Who solved the most previous-year questions this week. Each question counts once, so it rewards new questions, not repeats. Every Monday the team picks a student of the week with great learning and gives them a shout-out.
        </p>

        {loading ? (
          <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" aria-label="Loading" /></div>
        ) : !user ? (
          <div className="clay mt-8 rounded-3xl p-6 text-center">
            <p className="font-display text-lg font-bold">Log in to see the leaderboard</p>
            <p className="mt-1 text-sm text-foreground/60">It's free. Your practice counts from the moment you start.</p>
            <Link to="/auth" search={{ tab: "signin", redirect: "/leaderboard" }} className="clay-btn mt-4 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-white">Log in</Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-2">
              {(["current", "last"] as Week[]).map((w) => (
                <button key={w} type="button" onClick={() => setWeek(w)} aria-pressed={week === w} className={`rounded-full px-4 py-2 text-xs font-bold ${week === w ? "bg-foreground text-background" : "border border-border text-foreground/70"}`}>
                  {w === "current" ? "This week" : "Last week"}
                </button>
              ))}
              {data && <span className="text-xs text-foreground/55">{data.weekLabel}</span>}
            </div>

            {err && <p role="alert" className="mt-4 text-sm text-red-600">{err}</p>}
            {!data && !err && <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" aria-label="Loading" /></div>}

            {data && me && (
              <>
                {data.featured && <FeaturedCard f={data.featured} className="mt-6" />}

                <section className="clay mt-6 rounded-3xl p-5" aria-label="Your week">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="font-display text-2xl font-bold">{me.solved}</p><p className="text-[11px] text-foreground/50">solved</p></div>
                    <div><p className="font-display text-2xl font-bold">{me.attempted}</p><p className="text-[11px] text-foreground/50">answered</p></div>
                    <div><p className="font-display text-2xl font-bold">{me.attempted ? `${me.accuracy}%` : "–"}</p><p className="text-[11px] text-foreground/50">accuracy</p></div>
                  </div>
                  <p className="mt-3 text-center text-sm font-semibold text-foreground/80">{status}</p>

                  <div className="mt-4 border-t border-border pt-4">
                    <label htmlFor="nick" className="text-xs font-bold text-foreground/70">Your nickname on the board</label>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <input id="nick" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Aarav K" className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
                      <button type="button" disabled={saving} onClick={() => void save(true)} className="clay-btn min-h-11 rounded-full px-5 text-sm font-bold text-white disabled:opacity-60">
                        {me.optedIn ? "Update" : "Show me"}
                      </button>
                      {me.optedIn && (
                        <button type="button" disabled={saving} onClick={() => void save(false)} className="min-h-11 rounded-full border border-border px-5 text-sm font-bold text-foreground/70 disabled:opacity-60">Hide me</button>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-foreground/55">Only this nickname and your score are shown, never your real name, photo or contact details. You can hide yourself any time. Don't use a phone number, email or link.</p>
                    {saveMsg && <p role="status" className="mt-2 text-xs font-semibold text-foreground/80">{saveMsg}</p>}
                  </div>
                </section>

                <h2 className="font-display mb-3 mt-10 text-xl font-bold">Top solvers</h2>
                {data.top.length === 0 ? (
                  <p className="clay rounded-3xl p-5 text-sm text-foreground/65">No one has joined the board for this week yet. Answer a few questions and be the first.</p>
                ) : (
                  <ol className="clay divide-y divide-border rounded-3xl px-5">
                    {data.top.map((r) => (
                      <li key={`${r.rank}-${r.name}`} className={`flex items-center gap-3 py-3 ${r.isYou ? "font-bold" : ""}`}>
                        <span className="w-7 text-sm text-foreground/50">{r.rank}</span>
                        <span className="flex-1 truncate text-[15px] text-foreground">{r.name}{r.isYou && <span className="ml-2 text-xs font-semibold text-primary">you</span>}</span>
                        <span className="w-16 text-right text-sm font-bold text-foreground">{r.solved}</span>
                        <span className="w-12 text-right text-xs text-foreground/55">{r.accuracy}%</span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-3 text-xs text-foreground/50">To be ranked: answer at least {data.rules.minAttempted} different questions in the week with {data.rules.minAccuracyPct}%+ accuracy. Weeks run Monday to Sunday, India time. Peeking at a solution doesn't count.</p>

                <Link to="/pyq" className="clay-btn mt-8 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-white">Practise PYQs</Link>
              </>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
