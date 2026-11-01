// Admin -> Growth ops. Are the growth features working? Nudge emails, referrals, phone-number consent, Pro drills,
// friend challenges and per-question timing, for the last 7 or 30 days. Read-only.
import { useCallback, useEffect, useState } from "react";
import { getGrowthOps } from "@/server-functions/growth-ops";
import type { GrowthOps } from "@/lib/growth-ops-types";

type AdminUser = { getIdToken: () => Promise<string> };

const n = (x: number) => x.toLocaleString("en-IN");

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-foreground/50">{sub}</p>}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="clay p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-foreground/45">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-sm text-foreground/45">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-sm">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">
            {head.map((h, i) => (
              <th key={h} className={`py-2 ${i === 0 ? "pr-3" : "px-3 text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border">
              {r.map((c, i) => (
                <td key={i} className={`py-2 ${i === 0 ? "pr-3 text-foreground" : "px-3 text-right font-semibold text-foreground/80"}`}>
                  {typeof c === "number" ? n(c) : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GrowthOpsModule({ adminUser }: { adminUser: AdminUser }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<GrowthOps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await adminUser.getIdToken();
      setData(await getGrowthOps({ data: { token, days } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the numbers.");
    } finally {
      setLoading(false);
    }
  }, [adminUser, days]);
  useEffect(() => {
    void load();
  }, [load]);

  const d = data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Growth ops</h2>
          <p className="text-xs text-foreground/50">Last {days} days{d ? `, as of ${new Date(d.generatedAt).toLocaleString("en-IN")}` : ""}.</p>
        </div>
        <div className="inline-flex rounded-full border border-border p-1">
          {([7, 30] as const).map((x) => (
            <button key={x} type="button" onClick={() => setDays(x)} className={`min-h-9 rounded-full px-4 text-sm font-bold ${days === x ? "bg-foreground text-background" : "text-foreground/70"}`}>
              {x} days
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="clay p-4 text-sm font-semibold text-destructive">{error}</p>}
      {loading && !d && <p className="text-sm text-foreground/50">Loading…</p>}

      {d && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Nudge emails sent" value={n(d.emails.byKind.reduce((s, k) => s + k.sent, 0))} sub={`to ${n(d.emails.studentsEmailed)} students`} />
            <Kpi label="Referrals rewarded" value={n(d.referrals.rewardedInWindow)} sub={`${n(d.referrals.createdInWindow)} new invites`} />
            <Kpi label="WhatsApp/SMS opt-in" value={d.consent.marketingOptInPct === null ? "No data" : `${d.consent.marketingOptInPct}%`} sub={`${n(d.consent.marketingOptIn)} of ${n(d.consent.withConsentRecord)} with a consent record`} />
            <Kpi label="Quick Mocks started" value={n(d.pro.drillsStarted)} sub={`${n(d.pro.studentsDrilling)} students`} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Nudge emails" hint="Day-1 first Quick Mock, yesterday's weak chapter, and revision due. A failure means the email provider refused it.">
              <Table head={["Email", "Sent", "Failed"]} rows={d.emails.byKind.map((k) => [k.label, k.sent, k.failed])} />
              <p className="mt-3 text-xs text-foreground/55">Streak reminders logged: {n(d.emails.streakReminders)}.</p>
              <p className="mt-1 text-xs text-foreground/55">
                Unsubscribed in this period: nudges {n(d.emails.optedOutInWindow.nudges)}, streak {n(d.emails.optedOutInWindow.streak)}, updates {n(d.emails.optedOutInWindow.marketing)}. All time: {n(d.emails.optedOut.nudges)} / {n(d.emails.optedOut.streak)} / {n(d.emails.optedOut.marketing)}.
              </p>
            </Card>

            <Card title="Referrals" hint="A friend counts as rewarded after their first finished Quick Mock; both get Pro days.">
              <Table head={["Status", "All time"]} rows={[["Waiting for a first Quick Mock", d.referrals.byStatus.pending], ["Rewarded", d.referrals.byStatus.rewarded], ["Did not count", d.referrals.byStatus.rejected]]} />
              {d.referrals.rejectedByReason.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-foreground/45">Why some did not count</p>
                  <Table head={["Reason", "Count"]} rows={d.referrals.rejectedByReason.map((r) => [r.label, r.n])} />
                </div>
              )}
              <p className="mt-3 text-xs text-foreground/55">Pro days given in this period: {n(d.referrals.proDaysGivenInWindow)}.</p>
              {d.referrals.top.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-foreground/45">Top referrers</p>
                  <Table head={["Student", "Rewarded", "Invited"]} rows={d.referrals.top.map((t) => [t.email ?? "unknown", t.rewarded, t.invited])} />
                </div>
              )}
            </Card>

            <Card title="Phone numbers and consent" hint="Students with a real mobile number, and how many have a recorded consent.">
              <Table
                head={["", "Students"]}
                rows={[
                  ["All profiles", d.consent.profiles],
                  ["With a real mobile number", d.consent.withRealMobile],
                  ["With a consent record", d.consent.withConsentRecord],
                  ["Opted in to WhatsApp/SMS offers", d.consent.marketingOptIn],
                  ["Real number but no consent record yet", d.consent.withoutConsentRecord],
                ]}
              />
              <p className="mt-3 text-xs text-foreground/55">Accounts with no consent record joined before consent was recorded. Do not send them offers on WhatsApp or SMS.</p>
            </Card>

            <Card title="Quick Mocks and Pro" hint="What students are running, and who is on Pro.">
              <Table
                head={["Started in this period", "Quick Mocks"]}
                rows={[["Standard", d.pro.byType.standard], ["Built by the student (custom)", d.pro.byType.custom], ["Mistake revision", d.pro.byType.revision], ["Friend challenges", d.pro.byType.challenge], ["Finished", d.pro.drillsSubmitted]]}
              />
              <p className="mt-3 text-xs text-foreground/55">
                Pro granted in this period: paid {n(d.pro.grantsInWindow.paid)}, gifted {n(d.pro.grantsInWindow.gift)}, from referrals {n(d.pro.grantsInWindow.referral)}. On Pro right now: {n(d.pro.proStudentsNow)}.
              </p>
            </Card>

            <Card title="Friend challenges">
              <Table head={["", "This period"]} rows={[["Challenges created", d.challenges.created], ["Attempts started (includes the sharers' own)", d.challenges.attemptsStarted], ["Attempts finished", d.challenges.attemptsCompleted]]} />
            </Card>

            <Card title="Per-question timing" hint="How many finished Quick Mocks recorded time per question (older ones did not).">
              <Table head={["", "Quick Mocks"]} rows={[["Finished", d.timing.submitted], ["With times recorded", d.timing.withTimes]]} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
