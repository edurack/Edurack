// Nudges a signed-in student to finish their profile (real name, mobile, city).
// Onboarding only collects exam + track and fills the rest with placeholders, so this
// is where the real details get collected. It saves through updateBasicInfo, the same
// server function the Profile page's inline fields use.
//
// Shown at most once per snooze period ("Maybe later" hides it for SNOOZE_DAYS), never
// stacks on top of another open dialog (e.g. the streak popup), and is purely a nudge:
// any failure just leaves the student on the dashboard.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, FileText, Sparkles } from "lucide-react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { updateBasicInfo } from "@/server-functions/profile";
import { isRealCity, isRealMobile, isRealName, missingProfileFields, PLACEHOLDER_CITY, PLACEHOLDER_MOBILE } from "@/lib/profile-completeness";

const SNOOZE_DAYS = 3;
const SHOW_DELAY_MS = 1500;
const snoozeKey = (uid: string) => `edurack-complete-profile-snooze:${uid}`;

function isSnoozed(uid: string): boolean {
  try {
    const until = Number(localStorage.getItem(snoozeKey(uid)) ?? 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}
function snooze(uid: string) {
  try {
    localStorage.setItem(snoozeKey(uid), String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch { /* storage unavailable: it may show again next visit, harmless */ }
}

type Basic = { fullName: string; mobile: string; city: string };

export function CompleteProfilePopup({ profile, onSaved }: { profile: Basic | null; onSaved: (next: Basic) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [city, setCity] = useState("");

  const incomplete = !!profile && missingProfileFields(profile).length > 0;

  // Decide once, after the profile has loaded, whether to show.
  useEffect(() => {
    if (!user || !profile || !incomplete || done || isSnoozed(user.uid)) return;
    const t = window.setTimeout(() => {
      // Don't pile onto another dialog (e.g. the streak popup) — try again on the next visit.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      // Start the form from real values only; placeholders are shown as empty fields.
      setName(isRealName(profile.fullName) ? profile.fullName : "");
      setMobile(isRealMobile(profile.mobile) ? profile.mobile : "");
      setCity(isRealCity(profile.city) ? profile.city : "");
      setOpen(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, !!profile, incomplete]);

  function close() {
    setOpen(false);
    if (user && !done) snooze(user.uid);
  }

  async function save() {
    if (!user || !profile) return;
    const n = name.trim();
    const m = mobile.trim();
    const c = city.trim();
    if (!isRealName(n)) return setErr("Enter your full name.");
    if (!isRealMobile(m)) return setErr("Enter a valid 10-digit mobile number.");
    if (!isRealCity(c)) return setErr("Enter your city.");

    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      // Only send what actually changed. The three fields are independent $set updates.
      const changes: Promise<unknown>[] = [];
      if (n !== profile.fullName) changes.push(updateBasicInfo({ data: { token, field: "fullName", value: n } }));
      if (m !== profile.mobile) changes.push(updateBasicInfo({ data: { token, field: "mobile", value: m } }));
      if (c !== profile.city) changes.push(updateBasicInfo({ data: { token, field: "city", value: c } }));
      await Promise.all(changes);
      onSaved({ fullName: n, mobile: m, city: c });
      setDone(true);
    } catch {
      setErr("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!user || !profile) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else setOpen(true); }}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-y-auto rounded-3xl border-0 p-0 [&>button]:text-white">
        <div className="ink-section relative isolate overflow-hidden px-5 pb-5 pt-6 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-300 text-amber-950">
              {done ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
            </span>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-200">{done ? "Profile complete" : "Takes 30 seconds"}</p>
          </div>
          <DialogTitle className="font-display mt-3 text-2xl font-extrabold leading-tight text-white">
            {done ? "You're all set" : "Complete your profile"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-white/65">
            {done
              ? "Thanks! Your free study material is ready whenever you need it."
              : "Add your name, mobile number and city to get picks matched to you, plus free notes, previous year papers, formula sheets and planners."}
          </DialogDescription>
        </div>

        <div className="space-y-4 bg-card px-5 pb-5 pt-4 text-foreground sm:px-6">
          {done ? (
            <Link
              to="/free-resources"
              onClick={() => setOpen(false)}
              className="clay-btn inline-flex min-h-11 w-full items-center justify-center gap-2 px-5 text-sm"
            >
              <FileText className="h-4 w-4" aria-hidden /> Open free resources <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Full name</span>
                <input
                  value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="name" placeholder="Your full name"
                  className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Mobile number</span>
                <input
                  value={mobile === PLACEHOLDER_MOBILE ? "" : mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  disabled={busy} inputMode="numeric" autoComplete="tel-national" placeholder="10-digit number"
                  className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">City</span>
                <input
                  value={city === PLACEHOLDER_CITY ? "" : city} onChange={(e) => setCity(e.target.value)} disabled={busy}
                  autoComplete="address-level2" placeholder="Where do you live?"
                  className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none"
                />
              </label>

              {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button" onClick={save} disabled={busy}
                  className="clay-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-5 text-sm disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save and continue
                </button>
                <button
                  type="button" onClick={close} disabled={busy}
                  className="min-h-11 rounded-full px-5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  Maybe later
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
