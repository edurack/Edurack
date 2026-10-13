// Campaign composer: write on the left, see the real email on the right.
import { useEffect, useMemo, useRef, useState } from "react";
import { countOutreachAudience, renderOutreachPreview, saveOutreachCampaign, sendOutreachTest } from "@/server-functions/outreach";
import type { OutreachAudience, OutreachCampaign } from "@/lib/outreach-types";

type AdminUser = { getIdToken: () => Promise<string> };
export type Draft = Omit<OutreachCampaign, "id" | "lastSentAt"> & { id?: string };

const input = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const label = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-foreground/50";

const EXAMS: { v: OutreachAudience["exam"]; l: string }[] = [
  { v: "neet", l: "NEET" }, { v: "jee", l: "JEE" }, { v: "cuet", l: "CUET" }, { v: "ipmat", l: "IPMAT" }, { v: "any", l: "Any exam" },
];
const TRACKS: { v: OutreachAudience["track"]; l: string }[] = [
  { v: "any", l: "All classes" }, { v: "11th", l: "Class 11" }, { v: "12th", l: "Class 12" }, { v: "Dropper", l: "Droppers" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground/70 hover:border-foreground/40"}`}
    >{children}</button>
  );
}

const validLink = (u: string) => { try { const x = new URL(u.trim()); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };

export function OutreachComposer({ adminUser, initial, onClose, onSaved }: {
  adminUser: AdminUser;
  initial: Draft;
  onClose: () => void;
  /** andSend → the parent opens the send dialog for the saved campaign. */
  onSaved: (id: string, andSend: boolean) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [html, setHtml] = useState("");
  const [subjectPreview, setSubjectPreview] = useState(initial.subject);
  const [wide, setWide] = useState(false);
  const [count, setCount] = useState<{ total: number; sample: { name: string; email: string }[] } | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | "test" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // Live preview: the server renders the exact HTML students receive.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await renderOutreachPreview({ data: { token: await adminUser.getIdToken(), campaign: { subject: d.subject, message: d.message, assets: d.assets } } });
        setHtml(r.html); setSubjectPreview(r.subject);
      } catch { /* preview is best-effort */ }
    }, 450);
    return () => clearTimeout(t);
  }, [d.subject, d.message, d.assets, adminUser]);

  // Live audience size.
  useEffect(() => {
    setCount(null);
    const t = setTimeout(async () => {
      try { setCount(await countOutreachAudience({ data: { token: await adminUser.getIdToken(), audience: d.audience } })); } catch { /* ignore */ }
    }, 350);
    return () => clearTimeout(t);
  }, [d.audience.exam, d.audience.track, d.audience.nonBuyersOnly, adminUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (/\[[^\]\n]{2,}\]/.test(d.subject + d.message)) w.push("Fill in the [bracketed] parts before sending.");
    if (d.subject.length > 70) w.push("Subject is long. Phones cut it off after about 60 characters.");
    if (d.assets.some((a) => a.label.trim() && !validLink(a.url))) w.push("One of your buttons has an invalid link (needs https://…).");
    if (d.assets.length === 0) w.push("No button yet. Emails with one clear button get more clicks.");
    return w;
  }, [d]);
  const blocking = !d.name.trim() || !d.subject.trim() || !d.message.trim() || d.assets.some((a) => !a.label.trim() || !validLink(a.url)) || /\[[^\]\n]{2,}\]/.test(d.subject + d.message);

  function insert(snippet: string, wrap?: [string, string]) {
    const el = area.current;
    if (!el) { setD({ ...d, message: d.message + snippet }); return; }
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = d.message.slice(s, e);
    const text = wrap ? wrap[0] + (selected || snippet) + wrap[1] : snippet;
    setD({ ...d, message: d.message.slice(0, s) + text + d.message.slice(e) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length); });
  }

  async function save(andSend: boolean) {
    setBusy(andSend ? "send" : "save"); setNote(null);
    try {
      const r = await saveOutreachCampaign({ data: { token: await adminUser.getIdToken(), campaign: d } });
      onSaved(r.id, andSend);
    } catch (e) { setNote({ ok: false, text: (e as Error).message }); setBusy(null); }
  }

  async function test() {
    setBusy("test"); setNote(null);
    try {
      const r = await sendOutreachTest({ data: { token: await adminUser.getIdToken(), campaign: { name: d.name || "test", subject: d.subject, message: d.message, assets: d.assets } } });
      setNote({ ok: true, text: `Test sent to ${r.email}. Check your inbox (and spam).` });
    } catch (e) { setNote({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  }

  const setAud = (patch: Partial<OutreachAudience>) => setD({ ...d, audience: { ...d.audience, ...patch } });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="clay-btn-ghost px-4 py-2 text-sm">← Back</button>
          <h2 className="font-display text-xl font-bold text-foreground">{d.id ? "Edit campaign" : "New campaign"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || blocking} onClick={test} className="clay-btn-ghost px-4 py-2 text-sm disabled:opacity-40">{busy === "test" ? "Sending test…" : "✉️ Send test to me"}</button>
          <button type="button" disabled={!!busy || blocking} onClick={() => save(false)} className="clay-btn-ghost px-4 py-2 text-sm disabled:opacity-40">{busy === "save" ? "Saving…" : "Save"}</button>
          <button type="button" disabled={!!busy || blocking} onClick={() => save(true)} className="clay-btn px-5 py-2 text-sm">{busy === "send" ? "Saving…" : "Save & send ▶"}</button>
        </div>
      </div>

      {note && <p className={`mb-4 rounded-2xl border px-4 py-2.5 text-sm ${note.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{note.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── editor ── */}
        <div className="space-y-5">
          <div className="clay space-y-4 p-5">
            <div>
              <label className={label}>Campaign name <span className="font-medium normal-case text-foreground/40">(only you see this)</span></label>
              <input className={input} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Droppers — October push" />
            </div>
            <div>
              <div className="flex items-end justify-between"><label className={label}>Subject line</label><span className={`mb-1.5 text-[11px] ${d.subject.length > 60 ? "text-amber-600" : "text-foreground/40"}`}>{d.subject.length}/60</span></div>
              <input className={input} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} placeholder="{{name}}, your NEET PYQ Blueprint is here 📚" />
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">Message</label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["Name", () => insert("{{name}}")],
                    ["Headline", () => insert("# Your headline\n\n")],
                    ["Bold", () => insert("bold text", ["**", "**"])],
                    ["List", () => insert("- First point\n- Second point\n- Third point\n\n")],
                    ["Callout", () => insert("> A short line you want them to remember.\n\n")],
                  ] as [string, () => void][]).map(([l, fn]) => (
                    <button key={l} type="button" onClick={fn} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground/70 hover:border-primary hover:text-primary">+ {l}</button>
                  ))}
                </div>
              </div>
              <textarea ref={area} rows={13} className={`${input} font-mono text-[13px] leading-relaxed`} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
              <p className="mt-1.5 text-[11px] text-foreground/45">Blank line = new paragraph · <code># headline</code> · <code>**bold**</code> · <code>- list</code> · <code>&gt; callout</code></p>
            </div>
          </div>

          <div className="clay p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">Buttons <span className="font-medium normal-case text-foreground/40">(first one is the main button)</span></label>
              {d.assets.length < 6 && <button type="button" className="text-xs font-bold text-primary" onClick={() => setD({ ...d, assets: [...d.assets, { label: "", url: "" }] })}>+ Add button</button>}
            </div>
            {d.assets.length === 0 && <p className="text-sm text-foreground/50">No buttons yet. Add one that links to a PDF page or a practice page.</p>}
            <div className="space-y-2">
              {d.assets.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">{i + 1}</span>
                  <input className={input} placeholder="Button text" value={a.label} onChange={(e) => setD({ ...d, assets: d.assets.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <input className={`${input} ${a.url && !validLink(a.url) ? "border-red-400" : ""}`} placeholder="https://…" value={a.url} onChange={(e) => setD({ ...d, assets: d.assets.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                  <button type="button" aria-label="Remove button" className="px-2 text-foreground/40 hover:text-red-500" onClick={() => setD({ ...d, assets: d.assets.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-foreground/45">Tip: link to the blog post that holds the PDF (login-gated, so it also earns sign-ups). Don't use short-lived signed file links.</p>
          </div>

          <div className="clay space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">Who gets it</h3>
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                {count ? `≈ ${count.total.toLocaleString("en-IN")} student${count.total === 1 ? "" : "s"}` : "Counting…"}
              </span>
            </div>
            <div><span className={label}>Exam</span><div className="flex flex-wrap gap-2">{EXAMS.map((x) => <Chip key={x.v} active={d.audience.exam === x.v} onClick={() => setAud({ exam: x.v })}>{x.l}</Chip>)}</div></div>
            <div><span className={label}>Class</span><div className="flex flex-wrap gap-2">{TRACKS.map((x) => <Chip key={x.v} active={d.audience.track === x.v} onClick={() => setAud({ track: x.v })}>{x.l}</Chip>)}</div></div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={d.audience.nonBuyersOnly} onChange={(e) => setAud({ nonBuyersOnly: e.target.checked })} />
              Only students who never purchased
            </label>
            <p className="text-[11px] text-foreground/45">Students who unsubscribed are always skipped. Nobody gets the same campaign twice.</p>
          </div>

          {warnings.length > 0 && (
            <ul className="space-y-1.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
        </div>

        {/* ── live preview ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">Live preview</span>
            <div className="flex gap-1">
              <Chip active={!wide} onClick={() => setWide(false)}>📱 Phone</Chip>
              <Chip active={wide} onClick={() => setWide(true)}>💻 Desktop</Chip>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-border bg-secondary">
            <div className="border-b border-border bg-background px-4 py-3">
              <p className="text-[11px] text-foreground/45">Inbox · Edurack</p>
              <p className="truncate text-sm font-bold text-foreground">{subjectPreview || "Your subject line"}</p>
            </div>
            <div className="flex justify-center p-3">
              <iframe title="Email preview" sandbox="" srcDoc={html} className="h-[640px] rounded-2xl bg-white" style={{ width: wide ? "100%" : 360, maxWidth: "100%", border: 0 }} />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-foreground/45">Shown with the name “Aarav”. Each student sees their own.</p>
        </div>
      </div>
    </div>
  );
}
