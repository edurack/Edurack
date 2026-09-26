import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Palette } from "lucide-react"; // TODO: no Tabler mapping found yet
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconLoader2 as Loader2,
  IconPencil as Pencil,
  IconCheck as Check,
  IconX as X,
  IconSchool as GraduationCap,
  IconReceipt as Receipt,
  IconBook2 as BookOpen,
  IconUsersGroup as Users2,
  IconCalendarEvent as CalendarDays,
  IconLifebuoy as LifeBuoy,
  IconLink as LinkIcon,
  IconArrowRight as ArrowRight,
  IconClock as Clock,
  IconTag as Tag,
} from "@tabler/icons-react";
import { Smartphone, ShieldAlert, Target, BarChart3 } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { getDeviceId } from "@/lib/device";
import { listSessions, forgetDevice, revokeAllSessions } from "@/server-functions/sessions";
import { getProfile, updateBasicInfo, updateAcademicInfo } from "@/server-functions/profile";
import { getMyPurchases, getMyBatchPerformance, listMyAllTickets } from "@/server-functions/student-data";
import { listMyBookedSessions } from "@/server-functions/student-sessions";
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

type Track = "Dropper" | "11th" | "12th" | "";

type FullProfile = {
  fullName: string;
  mobile: string;
  city: string;
  currentClass: string;
  board: string;
  targetExam: string;
  track: Track;
  email: string | null;
  provider: string | null;
  createdAt: string | null;
};

type Purchase = {
  itemType: "bundle" | "mentorship" | "mentorTest";
  itemId: string;
  title: string;
  track: string | null;
  thumbnailUrl: string | null;
  amount: number;
  razorpayPaymentId: string;
  purchasedAt: string | null;
};

const PURCHASE_LABEL: Record<Purchase["itemType"], string> = { bundle: "Test Series", mentorship: "Mentorship", mentorTest: "Individual Test" };
const PURCHASE_BADGE: Record<Purchase["itemType"], string> = {
  bundle: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  mentorship: "bg-primary text-primary-foreground",
  mentorTest: "border border-border text-foreground/70",
};

type BatchPerformance = {
  bundleId: string;
  bundleTitle: string;
  testsAttempted: number;
  totalAttempts: number;
  averagePercent: number;
  bestPercent: number;
};

type BookingRow = {
  id: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  is_free: boolean;
  status: "upcoming" | "completed" | "cancelled" | "no_show";
  meeting_link: string | null;
  mentor_session_offerings?: { title: string };
};

type TicketRow = {
  id: string;
  subject: string;
  status: string;
  source: { type: "bundle" | "mentorship" | "platform"; itemTitle?: string };
  createdAt: string | null;
};

const CLASS_OPTIONS = ["Class 11", "Class 12", "Dropper"];
const BOARD_OPTIONS = ["CBSE", "ICSE", "Maharashtra", "Karnataka", "Tamil Nadu", "Uttar Pradesh", "West Bengal", "Other"];
const TRACK_OPTIONS: Track[] = ["11th", "12th", "Dropper"];

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const slotDate = (r: BookingRow) => new Date(`${r.session_date}T${r.start_time}:00`);

function SectionCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  action?: ReactNode;
  children: ReactNode;
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
      <div className="h-3 w-32 animate-pulse rounded bg-foreground/10" />
      <div className="h-3 w-16 animate-pulse rounded bg-foreground/10" />
    </div>
  );
}

const TICKET_STATUS: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [batchPerformance, setBatchPerformance] = useState<BatchPerformance[] | null>(null);
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const [{ profile: p }, { sessions: rows }, { purchases: purchaseRows }, { batches: perfRows }, { bookings: bookingRows }, { tickets: ticketRows }] =
        await Promise.all([
          getProfile({ data: { token } }),
          listSessions({ data: { token } }),
          getMyPurchases({ data: { token } }),
          getMyBatchPerformance({ data: { token } }),
          listMyBookedSessions({ data: { token } }),
          listMyAllTickets({ data: { token } }),
        ]);
      if (p) {
        setProfile({
          fullName: p.fullName,
          mobile: p.mobile,
          city: p.city,
          currentClass: p.currentClass,
          board: p.board,
          targetExam: p.targetExam || "NEET",
          track: (p.track || "") as Track,
          email: p.email,
          provider: p.provider,
          createdAt: p.createdAt,
        });
      }
      setSessions(rows);
      setPurchases(purchaseRows as Purchase[]);
      setBatchPerformance(perfRows as BatchPerformance[]);
      setBookings(bookingRows as BookingRow[]);
      setTickets(ticketRows as TicketRow[]);
    })();
  }, [user]);

  async function handleFieldSave(field: "fullName" | "mobile" | "city", value: string) {
    if (!user) return;
    const token = await user.getIdToken();
    await updateBasicInfo({ data: { token, field, value } });
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleAcademicSave(field: "currentClass" | "board" | "track", value: string) {
    if (!user || !profile) return;
    const token = await user.getIdToken();
    const next = { currentClass: profile.currentClass, board: profile.board, track: profile.track, [field]: value };
    await updateAcademicInfo({ data: { token, ...next } });
    setProfile((prev) => (prev ? { ...prev, [field]: value as never } : prev));
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

  // ── At-a-glance stats, computed from data we're fetching anyway ─────────
  const attempts = batchPerformance?.reduce((n, b) => n + b.totalAttempts, 0) ?? 0;
  const avgScore = batchPerformance && attempts > 0
    ? Math.round(batchPerformance.reduce((s, b) => s + b.averagePercent * b.totalAttempts, 0) / attempts)
    : null;
  const testsAttempted = batchPerformance?.reduce((n, b) => n + b.testsAttempted, 0) ?? null;
  const upcomingSessions = useMemo(() => {
    if (!bookings) return null;
    const now = new Date();
    return bookings.filter((b) => b.status === "upcoming" && slotDate(b) >= now).sort((a, b) => slotDate(a).getTime() - slotDate(b).getTime());
  }, [bookings]);
  const openTickets = tickets?.filter((t) => t.status === "open" || t.status === "pending").length ?? null;

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
    <div className="min-h-screen bg-background">
      <AppHeader user={user} displayName={profile?.fullName} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/dashboard" className="mb-4 inline-flex min-h-9 items-center text-sm font-semibold text-muted-foreground hover:text-foreground">← Dashboard</Link>

        {/* ── Identity hero ────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="ink-section h-16 sm:h-20" />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
              <div className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-4 ring-card sm:-mt-12 sm:h-24 sm:w-24">
                {isGoogleUser && user.photoURL ? (
                  <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-2xl font-bold text-foreground/60 sm:text-3xl">
                    {initials}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1 text-center sm:pb-2 sm:text-left">
                <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {profile?.fullName || user.displayName || "Student"}
                </h1>
                <p className="mt-0.5 truncate text-sm text-foreground/60">{user.email}</p>
              </div>

              <p className="shrink-0 text-xs text-foreground/50 sm:pb-2">
                {profile?.createdAt ? `On Edurack since ${formatDate(profile.createdAt)}` : ""}
              </p>
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

        {/* ── At a glance ──────────────────────────────────────────────── */}
        <dl className="mt-6 grid grid-cols-2 divide-x divide-y divide-border rounded-3xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
          {[
            ["Avg. score", avgScore !== null ? `${avgScore}%` : "–"],
            ["Tests taken", testsAttempted ?? "–"],
            ["Purchases", purchases?.length ?? "–"],
            ["Sessions ahead", upcomingSessions?.length ?? "–"],
          ].map(([label, v]) => (
            <div key={label as string} className="px-4 py-4 text-center sm:px-3">
              <dd className="font-display text-2xl font-extrabold tracking-tight">{v}</dd>
              <dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>

        {/* ── Academic profile (editable) ─────────────────────────────── */}
        <div className="mt-6">
          <SectionCard icon={GraduationCap} title="Academic profile">
            <p className="mb-4 text-sm text-foreground/60">
              Kept up to date, this is what decides which test series and mentors show up under "For you".
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <EditableSelect
                label="Current class"
                value={profile?.currentClass ?? ""}
                options={CLASS_OPTIONS}
                onSave={(v) => handleAcademicSave("currentClass", v)}
              />
              <EditableSelect
                label="Board"
                value={profile?.board ?? ""}
                options={BOARD_OPTIONS}
                onSave={(v) => handleAcademicSave("board", v)}
              />
              <EditableSelect
                label="Track"
                value={profile?.track ?? ""}
                options={TRACK_OPTIONS.filter((t): t is "11th" | "12th" | "Dropper" => !!t)}
                onSave={(v) => handleAcademicSave("track", v)}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-xs text-foreground/60">
              <Target className="h-3.5 w-3.5 shrink-0" />
              Target exam is <span className="font-semibold text-foreground">{profile?.targetExam || "NEET"}</span> — changing this affects your recommendations platform-wide, so raise a support ticket if it needs to change.
            </div>
          </SectionCard>
        </div>

        {/* ── Sessions ─────────────────────────────────────────────────── */}
        <SectionCard icon={CalendarDays} title="Sessions" action={<Link to="/my-sessions" className="inline-flex min-h-8 items-center text-xs font-bold text-primary hover:underline">View all</Link>}>
          {bookings === null ? (
            <div className="space-y-3"><RowSkeleton /></div>
          ) : !upcomingSessions || upcomingSessions.length === 0 ? (
            <p className="text-sm text-foreground/60">No upcoming sessions booked. <Link to="/dashboard" className="font-semibold text-primary hover:underline">Browse open sessions</Link>.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingSessions.slice(0, 3).map((b) => (
                <li key={b.id} className="clay-inset flex items-center gap-3 px-4 py-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Clock className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{b.mentor_session_offerings?.title ?? "Mentor session"}</p>
                    <p className="truncate text-xs text-foreground/50">{slotDate(b).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {b.start_time} · {b.is_free ? "Free" : "Paid"}</p>
                  </div>
                  {b.meeting_link && <a href={b.meeting_link} target="_blank" rel="noreferrer" className="clay-btn-ghost inline-flex min-h-9 shrink-0 items-center gap-1.5 px-3 text-xs"><LinkIcon className="h-3.5 w-3.5" />Join</a>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* ── Support ──────────────────────────────────────────────────── */}
        <SectionCard
          icon={LifeBuoy}
          title="Support"
          action={<Link to="/tickets" className="inline-flex min-h-8 items-center text-xs font-bold text-primary hover:underline">{tickets && tickets.length > 0 ? "View all" : "Raise a ticket"}</Link>}
        >
          {tickets === null ? (
            <div className="space-y-3"><RowSkeleton /></div>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-foreground/60">No support tickets raised yet.</p>
          ) : (
            <>
              {openTickets !== null && openTickets > 0 && (
                <p className="mb-3 text-xs font-semibold text-primary">{openTickets} ticket{openTickets === 1 ? "" : "s"} awaiting a reply</p>
              )}
              <ul className="space-y-2">
                {tickets.slice(0, 3).map((t) => (
                  <li key={t.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.subject}</p>
                      <p className="truncate text-xs text-foreground/50">{t.source.type === "platform" ? "Platform" : t.source.itemTitle} · {formatDate(t.createdAt)}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground/70">{TICKET_STATUS[t.status] ?? t.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

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
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
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
                    className="clay-btn-ghost shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/70 disabled:opacity-50"
                  >
                    {busyId === s.deviceId ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 px-4 py-3 text-xs text-foreground/70">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              "Remove" only clears a device from this list. To actually sign out of every device
              (including this one), use the button below.
            </p>
          </div>

          <button
            onClick={handleSignOutEverywhere}
            className="clay-btn-ghost mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-foreground"
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
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        b.averagePercent < 50 ? "bg-destructive" : "bg-primary"
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
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${PURCHASE_BADGE[p.itemType]}`}>
                            {PURCHASE_LABEL[p.itemType]}
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
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PURCHASE_BADGE[p.itemType]}`}>
                        {p.itemType === "bundle" ? (
                          <BookOpen className="h-2.5 w-2.5" />
                        ) : p.itemType === "mentorship" ? (
                          <Users2 className="h-2.5 w-2.5" />
                        ) : (
                          <Tag className="h-2.5 w-2.5" />
                        )}
                        {p.itemType === "bundle" ? "Series" : p.itemType === "mentorship" ? "Mentor" : "Test"}
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
        editing ? "ring-2 ring-primary" : ""
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
              className="shrink-0 text-primary disabled:opacity-50"
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
          {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group mt-1 flex min-h-6 w-full items-center justify-between gap-2 text-left"
        >
          <span className="truncate text-sm text-foreground">{value || "Add " + label.toLowerCase()}</span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-opacity duration-200 group-hover:text-foreground/60 group-active:text-foreground/60" />
        </button>
      )}
    </div>
  );
}

// A dropdown version of EditableField for small fixed-option fields (class,
// board, track) — saves as soon as a new option is picked, no separate
// confirm step needed since there's nothing to mistype.
function EditableSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: string[];
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <div className={`clay-inset rounded-2xl px-4 py-2.5 text-left transition-shadow duration-200 ${editing ? "ring-2 ring-primary" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
      {editing ? (
        <div className="mt-1 flex items-center gap-2">
          <select
            autoFocus
            defaultValue={value}
            disabled={saving}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={() => setEditing(false)}
            className="w-full min-h-6 bg-transparent text-sm text-foreground focus:outline-none"
          >
            {!value && <option value="">Select…</option>}
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          {saving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group mt-1 flex min-h-6 w-full items-center justify-between gap-2 text-left"
        >
          <span className="truncate text-sm text-foreground">{value || "Set " + label.toLowerCase()}</span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-opacity duration-200 group-hover:text-foreground/60 group-active:text-foreground/60" />
        </button>
      )}
      {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}