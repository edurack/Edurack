// Admin → Team. Everyone with an admin login: their profile, what they changed (logged
// automatically) and the progress updates they post. One shared, always-visible picture.
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTeamOverview, listTeamFeed, postTeamUpdate, updateMyTeamProfile } from "@/server-functions/team";
import { AVATAR_COLORS, type TeamFeedItem, type TeamMember } from "@/lib/team-types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AdminUser = { getIdToken: () => Promise<string> };

const input = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const lbl = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-foreground/50";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
const dayLabel = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (key(d) === key(t)) return "Today";
  if (key(d) === key(new Date(t.getTime() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short" });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const online = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 15 * 60000;

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return <span className="grid shrink-0 place-items-center rounded-full font-display font-bold text-[#1F2333]" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>{initials}</span>;
}

export function TeamModule({ adminUser }: { adminUser: AdminUser }) {
  const [me, setMe] = useState<TeamMember | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [feed, setFeed] = useState<TeamFeedItem[]>([]);
  const [tab, setTab] = useState<"all" | "update" | "action">("all");
  const [person, setPerson] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const token = useCallback(() => adminUser.getIdToken(), [adminUser]);

  const loadFeed = useCallback(async () => {
    try { setFeed(await listTeamFeed({ data: { token: await token(), limit: 120, uid: person || undefined, kind: tab === "all" ? undefined : tab } })); }
    catch (e) { setErr((e as Error).message); }
  }, [token, person, tab]);

  const loadTeam = useCallback(async () => {
    try {
      const r = await getTeamOverview({ data: { token: await token() } });
      setMe(r.me); setMembers(r.members); setLoaded(true);
    } catch (e) { setErr((e as Error).message); setLoaded(true); }
  }, [token]);

  useEffect(() => { loadTeam(); }, [loadTeam]);
  useEffect(() => { loadFeed(); const t = setInterval(loadFeed, 60000); return () => clearInterval(t); }, [loadFeed]);

  const grouped = useMemo(() => {
    const g: { label: string; items: TeamFeedItem[] }[] = [];
    for (const it of feed) {
      const label = dayLabel(it.at);
      const last = g[g.length - 1];
      if (last && last.label === label) last.items.push(it); else g.push({ label, items: [it] });
    }
    return g;
  }, [feed]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  if (!loaded) return <div className="space-y-3"><div className="clay-inset h-24 animate-pulse rounded-2xl" /><div className="clay-inset h-64 animate-pulse rounded-2xl" /></div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Team</h1>
          <p className="mt-1 text-sm text-foreground/60">Everyone with an admin login: who they are, what they changed, and where they're at.</p>
        </div>
        <button type="button" onClick={() => setPostOpen(true)} className="clay-btn px-5 py-2.5 text-sm">✍️ Post an update</button>
      </div>

      {err && <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</p>}
      {toast && <p className="mb-4 rounded-2xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm text-green-800">{toast}</p>}

      {/* my profile */}
      {me && (
        <div className="clay mb-6 flex flex-wrap items-center gap-4 p-5">
          <Avatar name={me.name} color={me.color} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-foreground">{me.name} <span className="text-sm font-medium text-foreground/45">(you)</span></p>
            <p className="text-sm text-foreground/60">{me.title || "Add your role, e.g. COO"} · {me.email}</p>
            {me.bio && <p className="mt-1 text-sm text-foreground/70">{me.bio}</p>}
          </div>
          <button type="button" onClick={() => setEditOpen(true)} className="clay-btn-ghost px-4 py-2 text-sm">Edit profile</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* feed */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-border bg-secondary p-1">
              {([["all", "Everything"], ["update", "✍️ Updates"], ["action", "⚙️ Changes"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${tab === k ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground"}`}>{l}</button>
              ))}
            </div>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className="rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground">
              <option value="">Everyone</option>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          </div>

          {feed.length === 0 && (
            <div className="clay px-6 py-12 text-center">
              <p className="text-4xl">🗒️</p>
              <p className="mt-3 font-display text-lg font-bold text-foreground">Nothing here yet</p>
              <p className="mt-1 text-sm text-foreground/60">Changes made in the dashboard show up here automatically. Post an update to tell the team what you're working on.</p>
            </div>
          )}

          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-foreground/45">{g.label}</p>
                <ul className="space-y-2.5">
                  {g.items.map((it) => it.kind === "update" ? (
                    <li key={it.id} className="clay p-4">
                      <div className="mb-3 flex items-center gap-3">
                        <Avatar name={it.name} color={it.color} size={34} />
                        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-foreground">{it.name} <span className="font-normal text-foreground/50">posted an update</span></p></div>
                        <span className="text-[11px] text-foreground/40">{timeOf(it.at)}</span>
                      </div>
                      <div className="space-y-2.5 text-sm">
                        {it.done && <div className="rounded-2xl bg-green-50 px-3.5 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-green-700">✅ Done</p><p className="mt-0.5 whitespace-pre-line text-foreground">{it.done}</p></div>}
                        {it.next && <div className="rounded-2xl bg-accent px-3.5 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-accent-foreground/70">🎯 Next</p><p className="mt-0.5 whitespace-pre-line text-foreground">{it.next}</p></div>}
                        {it.blockers && <div className="rounded-2xl bg-amber-50 px-3.5 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">🚧 Blockers</p><p className="mt-0.5 whitespace-pre-line text-foreground">{it.blockers}</p></div>}
                      </div>
                    </li>
                  ) : (
                    <li key={it.id} className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                      <Avatar name={it.name} color={it.color} size={30} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="text-foreground"><strong>{it.name}</strong> <span className="text-foreground/70">{(it.label ?? "").toLowerCase()}</span> <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-foreground/55">{it.module}</span></p>
                        {it.summary && <p className="mt-0.5 truncate text-xs text-foreground/50">{it.summary}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-foreground/40">{timeOf(it.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* members */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-foreground/45">The team · {members.length}</p>
          <ul className="space-y-2.5">
            {members.map((m) => (
              <li key={m.uid}>
                <button type="button" onClick={() => setPerson(person === m.uid ? "" : m.uid)} className={`clay w-full p-4 text-left transition-colors hover:border-primary/50 ${person === m.uid ? "border-primary" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="relative"><Avatar name={m.name} color={m.color} size={42} /><i className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${online(m.lastActiveAt) ? "bg-green-500" : "bg-foreground/25"}`} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{m.name}</p>
                      <p className="truncate text-xs text-foreground/55">{m.title || "No role set"}</p>
                    </div>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{m.actions7d} / 7d</span>
                  </div>
                  <p className="mt-2 text-[11px] text-foreground/45">{online(m.lastActiveAt) ? "Active now" : `Last active ${ago(m.lastActiveAt)}`}{m.outsideDomain ? " · outside company domain" : ""}</p>
                  {m.bio && <p className="mt-1 line-clamp-2 text-xs text-foreground/60">{m.bio}</p>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-foreground/40">Tap a person to see only their activity.</p>
        </div>
      </div>

      <EditProfile open={editOpen} me={me} onClose={() => setEditOpen(false)} onSave={async (v) => { await updateMyTeamProfile({ data: { token: await token(), ...v } }); setEditOpen(false); flash("Profile saved."); loadTeam(); }} />
      <PostUpdate open={postOpen} onClose={() => setPostOpen(false)} onPost={async (v) => { await postTeamUpdate({ data: { token: await token(), ...v } }); setPostOpen(false); flash("Update posted for the whole team."); setTab("all"); loadFeed(); }} />
    </div>
  );
}

function EditProfile({ open, me, onClose, onSave }: { open: boolean; me: TeamMember | null; onClose: () => void; onSave: (v: { name: string; title: string; bio: string; color: string }) => Promise<void> }) {
  const [v, setV] = useState({ name: "", title: "", bio: "", color: AVATAR_COLORS[0] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open && me) { setV({ name: me.name, title: me.title, bio: me.bio, color: me.color }); setErr(null); } }, [open, me]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-xl">Your profile</DialogTitle><DialogDescription className="sr-only">Edit how you appear to the team.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Avatar name={v.name || "?"} color={v.color} size={52} /><div className="flex flex-wrap gap-1.5">{AVATAR_COLORS.map((c) => <button key={c} type="button" aria-label="Pick colour" onClick={() => setV({ ...v, color: c })} className={`h-6 w-6 rounded-full border-2 ${v.color === c ? "border-primary" : "border-transparent"}`} style={{ background: c }} />)}</div></div>
          <div><label className={lbl}>Name</label><input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div><label className={lbl}>Role</label><input className={input} placeholder="e.g. COO · Marketing" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
          <div><label className={lbl}>About you <span className="font-medium normal-case text-foreground/40">(optional)</span></label><textarea rows={3} className={input} placeholder="What you own at Edurack" value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await onSave(v); } catch (e) { setErr((e as Error).message); } setBusy(false); }} className="clay-btn w-full py-3 text-sm">{busy ? "Saving…" : "Save profile"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PostUpdate({ open, onClose, onPost }: { open: boolean; onClose: () => void; onPost: (v: { done: string; next: string; blockers: string }) => Promise<void> }) {
  const [v, setV] = useState({ done: "", next: "", blockers: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setV({ done: "", next: "", blockers: "" }); setErr(null); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-xl">Post an update</DialogTitle><DialogDescription>The whole team sees this. Keep it short and honest.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><label className={lbl}>✅ What I got done</label><textarea rows={3} className={input} placeholder="Shipped the outreach templates, sent test emails…" value={v.done} onChange={(e) => setV({ ...v, done: e.target.value })} /></div>
          <div><label className={lbl}>🎯 What I'm doing next</label><textarea rows={2} className={input} placeholder="Send the first campaign to droppers" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} /></div>
          <div><label className={lbl}>🚧 What's blocking me <span className="font-medium normal-case text-foreground/40">(optional)</span></label><textarea rows={2} className={input} placeholder="Waiting for Resend domain verification" value={v.blockers} onChange={(e) => setV({ ...v, blockers: e.target.value })} /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="button" disabled={busy || (!v.done.trim() && !v.next.trim() && !v.blockers.trim())} onClick={async () => { setBusy(true); setErr(null); try { await onPost(v); } catch (e) { setErr((e as Error).message); } setBusy(false); }} className="clay-btn w-full py-3 text-sm disabled:opacity-40">{busy ? "Posting…" : "Post to the team"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
