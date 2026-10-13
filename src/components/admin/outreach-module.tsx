// Admin → Outreach. Save an email once (message + PDF links + audience), then send it with one tap.
import { useEffect, useState } from "react";
import {
  continueOutreachJob, deleteOutreachCampaign, listOutreachCampaigns, previewOutreachAudience, saveOutreachCampaign, startOutreachSend,
} from "@/server-functions/outreach";
import { EMPTY_CAMPAIGN, NEET_STARTER, type OutreachCampaign, type OutreachJobView } from "@/lib/outreach-types";

type AdminUser = { getIdToken: () => Promise<string> };
type Draft = Omit<OutreachCampaign, "id" | "lastSentAt"> & { id?: string };
type Preview = { inAudience: number; willReceive: number; alreadySent: number; sample: { name: string; email: string }[] };

const field = "clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none";

export function OutreachModule({ adminUser }: { adminUser: AdminUser }) {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [jobs, setJobs] = useState<OutreachJobView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ campaign: OutreachCampaign; preview: Preview | null } | null>(null);
  const [progress, setProgress] = useState<{ campaignId: string; job: OutreachJobView } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = () => adminUser.getIdToken();

  async function load() {
    try {
      const r = await listOutreachCampaigns({ data: { token: await token() } });
      setCampaigns(r.campaigns);
      setJobs(r.jobs);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    try {
      await saveOutreachCampaign({ data: { token: await token(), campaign: draft } });
      setDraft(null);
      await load();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  async function askConfirm(c: OutreachCampaign) {
    setConfirm({ campaign: c, preview: null });
    try {
      const preview = await previewOutreachAudience({ data: { token: await token(), campaignId: c.id } });
      setConfirm({ campaign: c, preview });
    } catch (e) { setMsg((e as Error).message); setConfirm(null); }
  }

  // The tap: start the job, then keep pulling chunks until it reports done.
  async function send(c: OutreachCampaign) {
    setConfirm(null); setBusy(true); setMsg(null);
    try {
      let job = await startOutreachSend({ data: { token: await token(), campaignId: c.id } });
      setProgress({ campaignId: c.id, job });
      while (job.status === "running") {
        job = await continueOutreachJob({ data: { token: await token(), jobId: job.id } });
        setProgress({ campaignId: c.id, job });
      }
      setMsg(`Done — ${job.sent} sent, ${job.failed} failed.`);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
    await load();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Outreach</h1>
          <p className="text-sm text-foreground/60">Save an email once, then send it to a whole audience with one tap.</p>
        </div>
        <button type="button" onClick={() => setDraft({ ...EMPTY_CAMPAIGN })} className="clay-btn rounded-full px-5 py-2.5 text-sm font-bold">+ New campaign</button>
      </div>

      {msg && <p className="clay-inset mb-4 px-4 py-2.5 text-sm text-foreground">{msg}</p>}

      {draft && (
        <div className="clay mb-6 space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">{draft.id ? "Edit campaign" : "New campaign"}</h2>
            {!draft.id && <button type="button" className="text-xs font-semibold text-primary" onClick={() => setDraft({ ...NEET_STARTER })}>Use NEET starter</button>}
          </div>
          <input className={field} placeholder="Campaign name (only you see this)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className={field} placeholder="Email subject — {{name}} works here too" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <textarea className={field} rows={7} placeholder="Message. Use {{name}} for the student's first name. Blank line = new paragraph." value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">PDF / asset buttons</p>
            {draft.assets.map((a, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input className={field} placeholder="Button label" value={a.label} onChange={(e) => setDraft({ ...draft, assets: draft.assets.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input className={field} placeholder="https://… link" value={a.url} onChange={(e) => setDraft({ ...draft, assets: draft.assets.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                <button type="button" className="px-2 text-foreground/50" onClick={() => setDraft({ ...draft, assets: draft.assets.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setDraft({ ...draft, assets: [...draft.assets, { label: "", url: "" }] })}>+ Add a PDF link</button>
            <p className="mt-1 text-[11px] text-foreground/45">Tip: link to a blog post that holds the PDF — the download there needs login, so it also gets you sign-ups. Links in emails shouldn't be short-lived signed URLs.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <select className={field} value={draft.audience.exam} onChange={(e) => setDraft({ ...draft, audience: { ...draft.audience, exam: e.target.value as any } })}>
              <option value="neet">Exam: NEET</option><option value="jee">Exam: JEE</option><option value="cuet">Exam: CUET</option><option value="ipmat">Exam: IPMAT</option><option value="any">Any exam</option>
            </select>
            <select className={field} value={draft.audience.track} onChange={(e) => setDraft({ ...draft, audience: { ...draft.audience, track: e.target.value as any } })}>
              <option value="any">Any track</option><option value="11th">11th</option><option value="12th">12th</option><option value="Dropper">Dropper</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={draft.audience.nonBuyersOnly} onChange={(e) => setDraft({ ...draft, audience: { ...draft.audience, nonBuyersOnly: e.target.checked } })} /> Never purchased</label>
          </div>

          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className="clay-btn rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-foreground/60">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {campaigns.length === 0 && !draft && <p className="text-sm text-foreground/60">No campaigns yet — create one, or start from the NEET template.</p>}
        {campaigns.map((c) => {
          const p = progress?.campaignId === c.id ? progress.job : null;
          return (
            <div key={c.id} className="clay p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-foreground/55">
                    {c.audience.exam.toUpperCase()} · {c.audience.track === "any" ? "all tracks" : c.audience.track}{c.audience.nonBuyersOnly ? " · non-buyers" : ""} · {c.assets.length} PDF link{c.assets.length === 1 ? "" : "s"}
                    {c.lastSentAt ? ` · last sent ${new Date(c.lastSentAt).toLocaleString()}` : " · never sent"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="text-xs font-semibold text-foreground/60" onClick={() => setDraft({ ...c })}>Edit</button>
                  <button type="button" className="text-xs font-semibold text-foreground/40" onClick={async () => { if (window.confirm(`Delete "${c.name}"?`)) { await deleteOutreachCampaign({ data: { token: await token(), campaignId: c.id } }); load(); } }}>Delete</button>
                  <button type="button" disabled={busy} onClick={() => askConfirm(c)} className="clay-btn rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50">Send ▶</button>
                </div>
              </div>

              {confirm?.campaign.id === c.id && (
                <div className="clay-inset mt-3 p-3 text-sm text-foreground">
                  {!confirm.preview ? "Checking audience…" : (
                    <>
                      <p><strong>{confirm.preview.willReceive}</strong> student{confirm.preview.willReceive === 1 ? "" : "s"} will get this{confirm.preview.alreadySent > 0 ? ` (${confirm.preview.alreadySent} already received it and are skipped)` : ""}.</p>
                      {confirm.preview.sample.length > 0 && <p className="mt-1 text-xs text-foreground/55">e.g. {confirm.preview.sample.map((s) => s.email).join(", ")}</p>}
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={confirm.preview.willReceive === 0} onClick={() => send(c)} className="clay-btn rounded-full px-5 py-2 text-sm font-bold disabled:opacity-40">Confirm &amp; send</button>
                        <button type="button" onClick={() => setConfirm(null)} className="px-3 text-sm font-semibold text-foreground/60">Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {p && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-foreground/10"><div className="h-full bg-primary transition-all" style={{ width: `${p.total ? Math.round(((p.sent + p.failed) / p.total) * 100) : 0}%` }} /></div>
                  <p className="mt-1 text-xs text-foreground/55">{p.status === "running" ? "Sending… keep this tab open (a background job finishes it if you close it)" : "Finished"} — {p.sent}/{p.total} sent{p.failed ? `, ${p.failed} failed` : ""}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {jobs.length > 0 && (
        <p className="mt-5 text-xs text-foreground/45">Recent sends: {jobs.slice(0, 5).map((j) => `${j.sent}/${j.total} ${j.status}`).join(" · ")}</p>
      )}
    </div>
  );
}
