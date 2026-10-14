// Admin → Outreach. Pick a ready-made template (or start blank), preview the real email,
// send yourself a test, then send to a whole audience with one confirmed tap.
import { DeliverabilityCard } from "@/components/admin/deliverability-card";
import { useEffect, useMemo, useState } from "react";
import {
  continueOutreachJob, deleteOutreachCampaign, listOutreachCampaigns, previewOutreachAudience, saveOutreachCampaign, startOutreachSend,
} from "@/server-functions/outreach";
import type { OutreachCampaign, OutreachJobView } from "@/lib/outreach-types";
import { BLANK_CAMPAIGN, OUTREACH_TEMPLATES, TEMPLATE_CATEGORIES, type OutreachTemplate, type TemplateCategory } from "@/lib/outreach-templates";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OutreachComposer, type Draft } from "./outreach-composer";

type AdminUser = { getIdToken: () => Promise<string> };
type Preview = { inAudience: number; willReceive: number; alreadySent: number; suppressed?: number; recent?: number; gapDays?: number; quiet?: boolean; sample: { name: string; email: string }[] };
type Stage = "checking" | "confirm" | "sending" | "done" | "error";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
const audienceText = (a: OutreachCampaign["audience"]) =>
  `${a.exam === "any" ? "Any exam" : a.exam.toUpperCase()} · ${a.track === "any" ? "all classes" : a.track === "Dropper" ? "droppers" : `class ${a.track.replace("th", "")}`}${a.nonBuyersOnly ? " · non-buyers" : ""}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="clay px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-foreground/50">{hint}</p>}
    </div>
  );
}

export function OutreachModule({ adminUser }: { adminUser: AdminUser }) {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [jobs, setJobs] = useState<OutreachJobView[]>([]);
  const [sentBy, setSentBy] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"templates" | "campaigns">("templates");
  const [cat, setCat] = useState<TemplateCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // send dialog state
  const [target, setTarget] = useState<OutreachCampaign | null>(null);
  const [stage, setStage] = useState<Stage>("checking");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<OutreachJobView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const token = () => adminUser.getIdToken();

  async function load(): Promise<OutreachCampaign[]> {
    try {
      const r = await listOutreachCampaigns({ data: { token: await token() } });
      setCampaigns(r.campaigns); setJobs(r.jobs); setSentBy(r.sentByCampaign ?? {}); setLoaded(true);
      return r.campaigns;
    } catch (e) { setMsg((e as Error).message); setLoaded(true); return []; }
  }
  useEffect(() => { load().then((c) => { if (c.length > 0) setTab("campaigns"); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const totalSent = useMemo(() => Object.values(sentBy).reduce((a, b) => a + b, 0), [sentBy]);
  const lastSend = useMemo(() => campaigns.map((c) => c.lastSentAt).filter(Boolean).sort().pop() ?? null, [campaigns]);
  const templates = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return OUTREACH_TEMPLATES.filter((t) => {
      if (cat !== "All" && t.category !== cat) return false;
      const hay = `${t.title} ${t.tagline} ${t.category} ${t.sendWhen} ${t.campaign.subject} ${t.campaign.message}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [cat, query]);
  const catCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of OUTREACH_TEMPLATES) m[t.category] = (m[t.category] ?? 0) + 1;
    return m;
  }, []);
  const running = (id: string) => jobs.find((j) => j.campaignId === id && j.status === "running");

  // ── send flow ──
  async function openSend(c: OutreachCampaign) {
    setTarget(c); setPreview(null); setJob(null); setErr(null);
    if (running(c.id)) { setStage("confirm"); setPreview({ inAudience: 0, willReceive: 0, alreadySent: 0, sample: [] }); return; }
    setStage("checking");
    try {
      setPreview(await previewOutreachAudience({ data: { token: await token(), campaignId: c.id } }));
      setStage("confirm");
    } catch (e) { setErr((e as Error).message); setStage("error"); }
  }

  async function confirmSend() {
    if (!target) return;
    setStage("sending"); setErr(null);
    try {
      let j = await startOutreachSend({ data: { token: await token(), campaignId: target.id } });
      setJob(j);
      // `waiting` = paused for quiet hours; stop looping (the background job resumes it after 8 AM IST).
      while (j.status === "running" && !j.waiting) {
        j = await continueOutreachJob({ data: { token: await token(), jobId: j.id } });
        setJob(j);
      }
      setStage("done");
    } catch (e) { setErr((e as Error).message); setStage("error"); }
    load();
  }

  function useTemplate(t: OutreachTemplate) {
    setDraft({ ...t.campaign, assets: t.campaign.assets.map((a) => ({ ...a })), audience: { ...t.campaign.audience } });
  }

  async function duplicate(c: OutreachCampaign) {
    try {
      await saveOutreachCampaign({ data: { token: await token(), campaign: { name: `${c.name} (copy)`, subject: c.subject, message: c.message, assets: c.assets, audience: c.audience } } });
      await load(); setMsg(`Duplicated "${c.name}".`);
    } catch (e) { setMsg((e as Error).message); }
  }

  if (draft) {
    return (
      <OutreachComposer
        adminUser={adminUser} initial={draft} onClose={() => setDraft(null)}
        onSaved={async (id, andSend) => {
          setDraft(null); setTab("campaigns");
          const list = await load();
          const c = list.find((x) => x.id === id);
          if (andSend && c) openSend(c); else setMsg("Campaign saved.");
        }}
      />
    );
  }

  const pct = job && job.total ? Math.round(((job.sent + job.failed) / job.total) * 100) : 0;

  return (
    <div>
      {/* header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Outreach</h1>
          <p className="mt-1 text-sm text-foreground/60">Email your students in a few taps: pick a template, preview it, send.</p>
        </div>
        <button type="button" onClick={() => setDraft({ ...BLANK_CAMPAIGN, assets: [], audience: { ...BLANK_CAMPAIGN.audience } })} className="clay-btn px-5 py-2.5 text-sm">+ Blank campaign</button>
      </div>

      <DeliverabilityCard adminUser={adminUser} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Campaigns" value={String(campaigns.length)} />
        <Stat label="Emails sent" value={totalSent.toLocaleString("en-IN")} />
        <Stat label="Last send" value={ago(lastSend)} />
      </div>

      {msg && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm text-foreground">
          <span>{msg}</span><button type="button" className="text-foreground/40" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* tabs */}
      <div className="mb-5 inline-flex rounded-full border border-border bg-secondary p-1">
        {([["templates", "✨ Templates"], ["campaigns", `📬 My campaigns${campaigns.length ? ` (${campaigns.length})` : ""}`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === k ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground"}`}>{l}</button>
        ))}
      </div>

      {/* ── template gallery ── */}
      {tab === "templates" && (
        <div>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${OUTREACH_TEMPLATES.length} templates: streak, JEE, parents, PDF, Hinglish…`}
            className="mb-3 w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none"
          />
          <div className="mb-4 flex flex-wrap gap-2">
            {(["All", ...TEMPLATE_CATEGORIES] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground/70 hover:border-foreground/40"}`}>
                {c} <span className="opacity-60">{c === "All" ? OUTREACH_TEMPLATES.length : catCount[c] ?? 0}</span>
              </button>
            ))}
          </div>
          {templates.length === 0 && <p className="mb-4 text-sm text-foreground/60">No templates match "{query}". Try a shorter word, or start from a blank campaign.</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.key} type="button" onClick={() => useTemplate(t)}
                className="clay group flex flex-col overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:border-primary/50"
              >
                <div className="flex items-center justify-between px-5 py-4" style={{ background: t.tint }}>
                  <span className="text-4xl leading-none">{t.emoji}</span>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1F2333]">{t.category}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="font-display text-base font-bold text-foreground">{t.title}</p>
                  <p className="mt-1 text-sm text-foreground/60">{t.tagline}</p>
                  <div className="mt-3 space-y-1 text-xs text-foreground/50">
                    <p>🎯 {audienceText(t.campaign.audience)}</p>
                    <p>🕒 {t.sendWhen}</p>
                    {t.needsEdit && <p className="font-semibold text-amber-600">✏️ Fill in the [blanks] before sending</p>}
                  </div>
                  <span className="mt-4 text-sm font-bold text-primary group-hover:underline">Use this template →</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── my campaigns ── */}
      {tab === "campaigns" && (
        <div className="space-y-3">
          {!loaded && <div className="clay-inset h-24 animate-pulse rounded-2xl" />}
          {loaded && campaigns.length === 0 && (
            <div className="clay px-6 py-12 text-center">
              <p className="text-4xl">📭</p>
              <p className="mt-3 font-display text-lg font-bold text-foreground">No campaigns yet</p>
              <p className="mt-1 text-sm text-foreground/60">Start from a ready-made template. It takes about a minute.</p>
              <button type="button" onClick={() => setTab("templates")} className="clay-btn mt-5 px-5 py-2.5 text-sm">Browse templates</button>
            </div>
          )}
          {campaigns.map((c) => {
            const run = running(c.id);
            const sent = sentBy[c.id] ?? 0;
            return (
              <div key={c.id} className="clay p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display text-base font-bold text-foreground">{c.name}</p>
                      {run && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Sending…</span>}
                      {!run && sent > 0 && <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-green-800">Sent</span>}
                      {!run && sent === 0 && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase text-foreground/50">Draft</span>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-foreground/60">“{c.subject}”</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/50">
                      <span>🎯 {audienceText(c.audience)}</span>
                      <span>🔘 {c.assets.length} button{c.assets.length === 1 ? "" : "s"}</span>
                      <span>📤 {sent.toLocaleString("en-IN")} sent</span>
                      <span>🕒 last sent {ago(c.lastSentAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className="rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-secondary" onClick={() => setDraft({ ...c })}>Edit</button>
                    <button type="button" className="rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-secondary" onClick={() => duplicate(c)}>Duplicate</button>
                    <button type="button" className="rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/40 hover:bg-secondary hover:text-red-500" onClick={async () => { if (window.confirm(`Delete "${c.name}"?`)) { await deleteOutreachCampaign({ data: { token: await token(), campaignId: c.id } }); load(); } }}>Delete</button>
                    <button type="button" onClick={() => openSend(c)} className="clay-btn ml-1 px-5 py-2 text-sm">{run ? "Resume ▶" : "Send ▶"}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── send dialog ── */}
      <Dialog open={!!target} onOpenChange={(o) => { if (!o && stage !== "sending") setTarget(null); }}>
        <DialogContent className="max-w-md rounded-3xl">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{stage === "done" ? "All done 🎉" : stage === "sending" ? "Sending…" : stage === "error" ? "Something went wrong" : `Send “${target.name}”?`}</DialogTitle>
                <DialogDescription className="sr-only">Confirm and send this campaign.</DialogDescription>
              </DialogHeader>

              {stage === "checking" && <div className="clay-inset h-24 animate-pulse rounded-2xl" />}

              {stage === "confirm" && preview && (
                <div className="space-y-4">
                  {running(target.id) ? (
                    <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">This campaign has a send in progress. Continue it now.</p>
                  ) : (
                    <>
                      <div className="rounded-2xl bg-accent px-5 py-5 text-center">
                        <p className="font-display text-4xl font-bold text-accent-foreground">{preview.willReceive.toLocaleString("en-IN")}</p>
                        <p className="text-sm text-accent-foreground/70">student{preview.willReceive === 1 ? "" : "s"} will get this email</p>
                      </div>
                      <div className="space-y-1 text-xs text-foreground/60">
                        <p>🎯 {audienceText(target.audience)}</p>
                        {preview.alreadySent > 0 && <p>⏭ {preview.alreadySent.toLocaleString("en-IN")} already received it and are skipped</p>}
                        {!!preview.recent && <p>🕒 {preview.recent.toLocaleString("en-IN")} skipped: emailed in the last {preview.gapDays} days</p>}
                        {!!preview.suppressed && <p>🚫 {preview.suppressed.toLocaleString("en-IN")} skipped: address bounced or reported spam</p>}
                        {preview.quiet && <p className="text-amber-700">🌙 Quiet hours (10 PM to 8 AM IST): sending will start automatically at 8 AM.</p>}
                        {preview.sample.length > 0 && <p>📬 e.g. {preview.sample.map((s) => s.email).join(", ")}</p>}
                        <p>⏱ About {Math.max(1, Math.ceil((preview.willReceive * 0.55) / 60))} min to finish. You can leave this tab open and keep working.</p>
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button type="button" disabled={!running(target.id) && preview.willReceive === 0} onClick={confirmSend} className="clay-btn flex-1 py-3 text-sm disabled:opacity-40">{running(target.id) ? "Continue sending ▶" : `Send to ${preview.willReceive.toLocaleString("en-IN")} ▶`}</button>
                    <button type="button" onClick={() => setTarget(null)} className="clay-btn-ghost px-5 py-3 text-sm">Cancel</button>
                  </div>
                </div>
              )}

              {stage === "sending" && (
                <div className="space-y-3">
                  <div className="h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(4, pct)}%` }} /></div>
                  <p className="text-center text-sm text-foreground">{job ? <><strong>{job.sent}</strong> of {job.total} sent{job.failed ? <span className="text-red-500"> · {job.failed} failed</span> : null}</> : "Starting…"}</p>
                  <p className="text-center text-xs text-foreground/50">Keep this tab open. If you close it, a background job finishes the rest.</p>
                </div>
              )}

              {stage === "done" && job && (
                <div className="space-y-4 text-center">
                  {job.waiting ? (
                    <>
                      <p className="font-display text-2xl font-bold text-foreground">Queued for the morning</p>
                      <p className="text-sm text-foreground/60">It's quiet hours, so nothing was sent. Sending starts by itself after 8 AM IST (needs the /cron/outreach job to be scheduled).</p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-4xl font-bold text-foreground">{job.sent.toLocaleString("en-IN")}</p>
                      <p className="text-sm text-foreground/60">emails sent{job.failed ? ` · ${job.failed} failed (check your Resend dashboard)` : ""}</p>
                    </>
                  )}
                  <button type="button" onClick={() => setTarget(null)} className="clay-btn px-8 py-2.5 text-sm">Close</button>
                </div>
              )}

              {stage === "error" && (
                <div className="space-y-4">
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>
                  <button type="button" onClick={() => setTarget(null)} className="clay-btn-ghost px-5 py-2.5 text-sm">Close</button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
