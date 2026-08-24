import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useState } from "react";
import {
  Loader2,
  Smartphone,
  ShieldAlert,
  Pencil,
  Check,
  X,
  GraduationCap,
  Target,
  Receipt,
  BarChart3,
  BookOpen,
  Users2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getDeviceId } from "@/lib/device";
import { listSessions, forgetDevice, revokeAllSessions } from "@/server-functions/sessions";
import { getProfile, updateBasicInfo } from "@/server-functions/profile";
import { getMyPurchases, getMyBatchPerformance } from "@/server-functions/student-data";
import { AppHeader } from "@/components/app-header";
import { signOutUser } from "@/lib/firebase";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

type SessionRow = {
  deviceId: string;
  deviceLabel: string;
  ip: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type FullProfile = {
  fullName: string;
  mobile: string;
  city: string;
  currentClass: string;
  board: string;
  targetExam: string;
  track: string;
};

type Purchase = {
  itemType: "bundle" | "mentorship";
  itemId: string;
  title: string;
  track: string | null;
  thumbnailUrl: string | null;
  amount: number;
  razorpayPaymentId: string;
  purchasedAt: string | null;
};

type BatchPerformance = {
  bundleId: string;
  bundleTitle: string;
  testsAttempted: number;
  totalAttempts: number;
  averagePercent: number;
  bestPercent: number;
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function SectionCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="clay mb-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="clay-inset flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-foreground/10" />
        <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-foreground/10" />
      </div>
      <div className="h-3 w-12 shrink-0 animate-pulse rounded-full bg-foreground/10" />
    </div>
  );
}

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [batchPerformance, setBatchPerformance] = useState<BatchPerformance[] | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const [{ profile: p }, { sessions: rows }, { purchases: purchaseRows }, { batches: perfRows }] =
        await Promise.all([
          getProfile({ data: { token } }),
          listSessions({ data: { token } }),
          getMyPurchases({ data: { token } }),
          getMyBatchPerformance({ data: { token } }),
        ]);
      if (p) {
        setProfile({
          fullName: p.fullName,
          mobile: p.mobile,
          city: p.city,
          currentClass: p.currentClass,
          board: p.board,
          targetExam: p.targetExam || "NEET",
          track: p.track || "",
        });
      }
      setSessions(rows);
      setPurchases(purchaseRows as Purchase[]);
      setBatchPerformance(perfRows as BatchPerformance[]);
    })();
  }, [user]);

  async function handleFieldSave(field: "fullName" | "mobile" | "city", value: string) {
    if (!user) return;
    const token = await user.getIdToken();
    await updateBasicInfo({ data: { token, field, value } });
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleForget(deviceId: string) {
    if (!user) return;
    setBusyId(deviceId);
    try {
      const token = await user.getIdToken();
      await forgetDevice({ data: { token, deviceId } });
      setSessions((prev) => prev?.filter((s) => s.deviceId !== deviceId) ?? null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSignOutEverywhere() {
    if (!user) return;
    const token = await user.getIdToken();
    await revokeAllSessions({ data: { token } });
    await signOutUser();
    navigate({ to: "/auth" });
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const currentDeviceId = getDeviceId();
  const isGoogleUser = user.providerData.some((p) => p.providerId === "google.com");
  const initials = (profile?.fullName || user.displayName || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-70 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-70 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} displayName={profile?.fullName} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* ── Identity banner ────────────────────────────────────────────── */}
        <div className="clay overflow-hidden p-0">
          <div className="h-16 bg-gradient-to-br from-[var(--sky-soft)] to-[var(--teal-soft)] sm:h-20" />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
              <div className="clay-inset -mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-background sm:-mt-12 sm:h-24 sm:w-24">
                {isGoogleUser && user.photoURL ? (
                  <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-2xl font-bold text-foreground/60 sm:text-3xl">
                    {initials}
                  </span>
                )}
              </div>

              <div className="min-w-0 pb-1 text-center sm:pb-2 sm:text-left">
                <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {profile?.fullName || user.displayName || "Student"}
                </h1>
                <p className="mt-0.5 truncate text-sm text-foreground/60">{user.email}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <EditableField
                label="Full name"
                value={profile?.fullName ?? ""}
                onSave={(v) => handleFieldSave("fullName", v)}
              />
              <EditableField
                label="Mobile"
                value={profile?.mobile ?? ""}
                onSave={(v) => handleFieldSave("mobile", v)}
                validate={(v) => (/^\d{10}$/.test(v) ? null : "Enter a valid 10-digit number")}
                inputMode="numeric"
              />
              <EditableField
                label="City / Town / Village"
                value={profile?.city ?? ""}
                onSave={(v) => handleFieldSave("city", v)}
              />
            </div>
          </div>
        </div>

        {/* ── Academic tracking metadata ─────────────────────────────────── */}
        <div className="mt-6">
          <SectionCard icon={GraduationCap} title="Academic profile">
            <div className="flex flex-wrap gap-2">
              <span className="clay-chip inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Class: {profile?.currentClass || "—"}
              </span>
              <span className="clay-chip inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Board: {profile?.board || "—"}
              </span>
              <span className="clay-chip inline-flex items-center gap-1.5 bg-[var(--sky-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                <Target className="h-3.5 w-3.5" />
                Target: {profile?.targetExam || "NEET"}
              </span>
            </div>
          </SectionCard>
        </div>

        {/* ── Appearance ─────────────────────────────────────────────────── */}
        <SectionCard icon={Palette} title="Appearance">
          <p className="mb-4 text-sm text-foreground/60">
            Choose how Edurack looks on this device. "System" matches your device's theme automatically.
          </p>
          <ThemeToggle />
        </SectionCard>


        {/* ── Device management ───────────────────────────────────────────── */}
        <SectionCard
          icon={Smartphone}
          title="Logged-in devices"
          action={
            sessions && sessions.length > 0 ? (
              <span className="clay-chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-foreground/60">
                {sessions.length}
              </span>
            ) : undefined
          }
        >
          {sessions === null ? (
            <div className="space-y-3">
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-foreground/60">No device history yet.</p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((s) => (
                <li key={s.deviceId} className="clay-inset flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {s.deviceLabel}
                      {s.deviceId === currentDeviceId && (
                        <span className="ml-2 rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-foreground/50">
                      {s.ip} · last active{" "}
                      {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : "unknown"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleForget(s.deviceId)}
                    disabled={busyId === s.deviceId}
                    className="clay-btn-ghost shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/70 transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {busyId === s.deviceId ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[var(--coral-soft)]/40 px-4 py-3 text-xs text-foreground/70">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              "Remove" only clears a device from this list. To actually sign out of every device
              (including this one), use the button below.
            </p>
          </div>

          <button
            onClick={handleSignOutEverywhere}
            className="clay-btn-ghost mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-foreground transition-transform duration-200 hover:-translate-y-0.5"
          >
            Sign out of all devices
          </button>
        </SectionCard>

        {/* ── Batch performance ──────────────────────────────────────────── */}
        <SectionCard icon={BarChart3} title="Overall performance">
          {batchPerformance === null ? (
            <div className="space-y-3">
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : batchPerformance.length === 0 ? (
            <p className="text-sm text-foreground/60">
              No test attempts yet — performance shows up here once you take a test in a purchased batch.
            </p>
          ) : (
            <ul className="space-y-2">
              {batchPerformance.map((b) => (
                <li key={b.bundleId} className="clay-inset px-4 py-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{b.bundleTitle}</p>
                    <span className="shrink-0 text-xs text-foreground/50">
                      {b.testsAttempted} test{b.testsAttempted !== 1 ? "s" : ""} · {b.totalAttempts} attempt
                      {b.totalAttempts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-foreground/60">
                    <span>Average: {b.averagePercent}%</span>
                    <span>Best: {b.bestPercent}%</span>
                  </div>
                  <div className="clay-inset mt-2 h-2 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        b.averagePercent < 50 ? "bg-[var(--coral-soft)]" : "bg-[var(--sky-deep)]"
                      }`}
                      style={{ width: `${b.averagePercent}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* ── Purchase / transaction history ──────────────────────────────── */}
        <SectionCard
          icon={Receipt}
          title="Transaction history"
          action={
            purchases && purchases.length > 0 ? (
              <span className="clay-chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-foreground/60">
                {purchases.length}
              </span>
            ) : undefined
          }
        >
          {purchases === null ? (
            <div className="space-y-3">
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : purchases.length === 0 ? (
            <p className="text-sm text-foreground/60">No purchases yet.</p>
          ) : (
            <>
              {/* Table on wider screens */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-foreground/50">
                      <th className="px-3 pb-1">Item</th>
                      <th className="px-3 pb-1">Type</th>
                      <th className="px-3 pb-1">Amount</th>
                      <th className="px-3 pb-1">Razorpay ref</th>
                      <th className="px-3 pb-1">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr
                        key={`${p.itemType}-${p.itemId}`}
                        className="clay-inset transition-colors duration-200 hover:bg-foreground/5"
                      >
                        <td className="max-w-[220px] truncate rounded-l-2xl px-3 py-3 font-medium text-foreground">
                          {p.title}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                              p.itemType === "bundle"
                                ? "bg-[var(--mint-soft)] text-foreground"
                                : "bg-[var(--sky-deep)] text-white"
                            }`}
                          >
                            {p.itemType === "bundle" ? "Test Series" : "Mentorship"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-foreground/80">
                          {currency.format(p.amount)}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-3 font-mono text-xs text-foreground/60"
                          title={p.razorpayPaymentId}
                        >
                          {p.razorpayPaymentId}
                        </td>
                        <td className="whitespace-nowrap rounded-r-2xl px-3 py-3 text-foreground/60">
                          {formatDate(p.purchasedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stacked cards on mobile — the table's columns don't fit a phone screen */}
              <ul className="space-y-3 sm:hidden">
                {purchases.map((p) => (
                  <li key={`${p.itemType}-${p.itemId}`} className="clay-inset px-4 py-3.5">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-foreground">{p.title}</p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          p.itemType === "bundle"
                            ? "bg-[var(--mint-soft)] text-foreground"
                            : "bg-[var(--sky-deep)] text-white"
                        }`}
                      >
                        {p.itemType === "bundle" ? (
                          <BookOpen className="h-2.5 w-2.5" />
                        ) : (
                          <Users2 className="h-2.5 w-2.5" />
                        )}
                        {p.itemType === "bundle" ? "Series" : "Mentor"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-foreground/60">
                      <span>{formatDate(p.purchasedAt)}</span>
                      <span className="font-semibold text-foreground/80">{currency.format(p.amount)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </main>
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  validate,
  inputMode,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  validate?: (value: string) => string | null;
  inputMode?: "text" | "numeric";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function handleSave() {
    if (validate) {
      const err = validate(draft);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`clay-inset rounded-2xl px-4 py-2.5 text-left transition-shadow duration-200 ${
        editing ? "ring-2 ring-[var(--sky-deep)]" : ""
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">{label}</p>

      {editing ? (
        <div className="mt-1">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              inputMode={inputMode}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") {
                  setDraft(value);
                  setEditing(false);
                  setError(null);
                }
              }}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Save"
              className="shrink-0 text-[var(--sky-deep)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                setDraft(value);
                setEditing(false);
                setError(null);
              }}
              aria-label="Cancel"
              className="shrink-0 text-foreground/40 hover:text-foreground/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-1 text-xs font-medium text-[var(--coral-soft)]">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group mt-1 flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="truncate text-sm text-foreground">{value || "Add " + label.toLowerCase()}</span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-opacity duration-200 group-hover:text-foreground/60 group-active:text-foreground/60" />
        </button>
      )}
    </div>
  );
}