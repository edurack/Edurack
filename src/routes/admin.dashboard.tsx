import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromoterHubModule } from "@/components/promoter-hub-module";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Loader2,
  ShieldCheck,
  LayoutDashboard,
  Trash2,
  Users,
  GraduationCap,
  LogOut,
  Users2,
  IndianRupee,
  ClipboardCheck,
  Smartphone,
  X,
  Menu,
  Package,
  Boxes,
  ClipboardList,
  ListChecks,
  Search,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  Inbox,
  LifeBuoy,
  MessageSquareText,
  Send,
  ArrowUpRight,
  ArrowLeft,
  Wallet,
  ShoppingBag,
  CheckCircle2,
  Layers3,
  Mail,
  Phone,
  MapPin,
  Star,
  FileCheck,
  FileText,
  Copy,
  UserPlus,
  ThumbsUp,
  ThumbsDown,
  Youtube,
  Instagram,
  Linkedin,
  Twitter,
  Megaphone,
  Send as SendIcon,
  Building2,
  Calendar,
  Link2,
} from "lucide-react";
import { useAdminClaim } from "@/lib/use-admin-claim";
import { signOutUser } from "@/lib/firebase";
import {
  getAdminAnalytics,
  listStudents,
  getAdminStudentFullProfile,
  listAllTicketsAdmin,
  updateTicketStatus,
  replyToTicket,
  listCreatorApplications,
  approveCreatorApplication,
  rejectCreatorApplication,
  reopenCreatorApplication,
  listBundlesForDeletion,
  listTestCoresForDeletion,
  deleteBundle,
  deleteTestCore,
  createMentor,
  updateMentorProfile,
  createMentorshipBatch,
} from "@/server-functions/admin";
import { updateMentorLockedInfo } from "@/server-functions/mentor-auth";
import { getMentorOnboardingDetails, markMentorProfileCreated, markMentorshipBatchLinked } from "@/server-functions/mentor-onboarding";
import { EXAM_KEYS, EXAM_LABELS as EXAM_LABEL_MAP, type Track, type ExamKey } from "@/lib/admin-types";
import { BundleCreationModule, BundleManagementModule } from "@/components/bundle-modules";
import { TestCoreModule } from "@/components/test-core-module";
import { QuestionIngestionModule } from "@/components/question-ingestion-module";
import { BundleInspectorModule } from "@/components/bundle-inspector-module";
import { MentorHubModule } from "@/components/mentor-hub-module";

type ModuleKey =
  | "overview"
  | "bundles"
  | "bundleManage"
  | "testCore"
  | "questions"
  | "inspector"
  | "students"
  | "applications"
  | "mentors"
  | "promoters"
  | "dangerZone"
  | "tickets";

type ModuleDef = { key: ModuleKey; label: string; icon: typeof LayoutDashboard };

// "Test Series" and "Announcements" have been removed entirely — Test Series
// wrote to a collection the real exam engine never reads, and Announcements
// posted somewhere the student dashboard doesn't read yet. Keeping either
// around just meant admins could enter data with no visible effect.
const MODULE_GROUPS: { label: string; items: ModuleDef[] }[] = [
  { label: "Overview", items: [{ key: "overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Content",
    items: [
      { key: "bundles", label: "Create Bundle", icon: Package },
      { key: "bundleManage", label: "Manage Bundles", icon: Boxes },
      { key: "testCore", label: "Test Core", icon: ClipboardList },
      { key: "questions", label: "Questions", icon: ListChecks },
      { key: "inspector", label: "Inspector", icon: Search },
    ],
  },
  {
  label: "People",
  items: [
    { key: "students", label: "Students", icon: Users },
    { key: "applications", label: "Applications", icon: FileCheck },
    { key: "mentors", label: "Mentors", icon: GraduationCap },
    { key: "promoters", label: "Promoters", icon: Megaphone },  // ← add (Megaphone already imported)
  ],
},
  { label: "Support", items: [{ key: "tickets", label: "Tickets", icon: LifeBuoy }] },
  { label: "Danger Zone", items: [{ key: "dangerZone", label: "Danger Zone", icon: Trash2 }] },
];

const MODULE_LOOKUP: Record<ModuleKey, ModuleDef> = Object.fromEntries(
  MODULE_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]),
) as Record<ModuleKey, ModuleDef>;
const MODULE_KEYS = Object.keys(MODULE_LOOKUP) as ModuleKey[];

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin Command Center · Edurack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: ModuleKey } => {
    const raw = typeof search.tab === "string" ? (search.tab as ModuleKey) : undefined;
    return { tab: raw && MODULE_KEYS.includes(raw) ? raw : undefined };
  },
  component: AdminDashboardPage,
});

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// Maps the exam keys stored on mentor applications (and, once catalog.ts
// is updated, bundles/batches) to their display labels.
const EXAM_LABELS: Record<string, string> = {
  neet: "NEET",
  jee: "JEE",
  cuet: "CUET",
  ipmat: "IPMAT",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function AdminDashboardPage() {
  const { adminUser, isAdmin, loading } = useAdminClaim();
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const activeModule: ModuleKey = tab ?? "overview";
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!adminUser || !isAdmin) {
      navigate({ to: "/admin/auth" });
    }
  }, [loading, adminUser, isAdmin, navigate]);

  function setActiveModule(key: ModuleKey) {
    navigate({ to: "/admin/dashboard", search: { tab: key }, replace: true });
    setDrawerOpen(false);
  }

  async function handleSignOut() {
    await signOutUser();
    navigate({ to: "/admin/auth" });
  }

  if (loading || !adminUser || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const adminEmail = (adminUser as { email?: string | null })?.email ?? undefined;
  const activeDef = MODULE_LOOKUP[activeModule];

  return (
    <div className="relative min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-40 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--mint-soft)] opacity-30 blur-3xl" />
      </div>

      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-foreground/5 bg-background/70 py-5 backdrop-blur-md md:flex">
          <SidebarContent
            activeModule={activeModule}
            onSelect={setActiveModule}
            onSignOut={handleSignOut}
            adminEmail={adminEmail}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:hidden">
          <header className="clay-sm sticky top-0 z-20 mx-3 mt-3 flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="clay flex h-8 w-8 shrink-0 items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-foreground/70" />
              </div>
              <span className="font-display text-sm font-bold text-foreground">{activeDef.label}</span>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="clay-btn-ghost grid h-9 w-9 place-items-center"
              aria-label="Open menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
          </header>

          {drawerOpen && (
            <div className="fixed inset-0 z-40 flex md:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
              <div className="clay relative flex h-full w-[82%] max-w-xs flex-col rounded-l-none rounded-r-3xl py-5">
                <div className="mb-2 flex items-center justify-between px-4">
                  <span className="font-display text-sm font-bold text-foreground">Admin Center</span>
                  <button onClick={() => setDrawerOpen(false)} className="text-foreground/40 hover:text-foreground/70">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarContent
                  activeModule={activeModule}
                  onSelect={setActiveModule}
                  onSignOut={handleSignOut}
                  adminEmail={adminEmail}
                  compactHeader
                />
              </div>
            </div>
          )}

          <main className="min-w-0 flex-1 px-4 py-6">
            <ModuleRouter activeModule={activeModule} adminUser={adminUser} />
          </main>
        </div>

        <main className="hidden min-w-0 flex-1 px-8 py-8 md:block">
          <div className="mx-auto max-w-5xl">
            <ModuleRouter activeModule={activeModule} adminUser={adminUser} />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  activeModule,
  onSelect,
  onSignOut,
  adminEmail,
  compactHeader,
}: {
  activeModule: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  onSignOut: () => void;
  adminEmail?: string;
  compactHeader?: boolean;
}) {
  return (
    <>
      {!compactHeader && (
        <div className="mb-4 flex items-center gap-2 px-3">
          <div className="clay flex h-9 w-9 shrink-0 items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-foreground/70" />
          </div>
          <span className="truncate font-display text-sm font-bold tracking-tight text-foreground">Admin Center</span>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3">
        {MODULE_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/35">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((m) => {
                const Icon = m.icon;
                const active = activeModule === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onSelect(m.key)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                      active ? "clay-btn text-white" : "text-foreground/70 hover:bg-foreground/5"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 space-y-1 border-t border-foreground/5 px-3 pt-4">
        {adminEmail && (
          <p className="truncate px-3 text-xs text-foreground/40" title={adminEmail}>
            {adminEmail}
          </p>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-foreground/60 transition-colors duration-200 hover:bg-foreground/5"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </>
  );
}

function ModuleRouter({
  activeModule,
  adminUser,
}: {
  activeModule: ModuleKey;
  adminUser: { getIdToken: () => Promise<string> };
}) {
  switch (activeModule) {
    case "overview":
      return <OverviewModule adminUser={adminUser} />;
    case "bundles":
      return <BundleCreationModule adminUser={adminUser} />;
    case "bundleManage":
      return <BundleManagementModule adminUser={adminUser} />;
    case "testCore":
      return <TestCoreModule adminUser={adminUser} />;
    case "questions":
      return <QuestionIngestionModule adminUser={adminUser} />;
    case "inspector":
      return <BundleInspectorModule adminUser={adminUser} />;
    case "students":
      return <StudentsModule adminUser={adminUser} />;
    case "applications":
      return <ApplicationsModule adminUser={adminUser} />;
    case "mentors":
      return <MentorHubModule adminUser={adminUser} />;
    case "promoters":
      return <PromoterHubModule adminUser={adminUser} />;
    case "tickets":
      return <TicketsModule adminUser={adminUser} />;
    case "dangerZone":
      return <DangerZoneModule adminUser={adminUser} />;
    default:
      return null;
  }
}

function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <AlertCircle className="h-5 w-5 text-foreground/40" />
      </div>
      <p className="max-w-sm text-sm text-foreground/60">{message}</p>
      <button
        onClick={onRetry}
        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="clay-inset grid h-12 w-12 place-items-center rounded-2xl">
        <Inbox className="h-5 w-5 text-foreground/30" />
      </div>
      <p className="text-sm text-foreground/60">{message}</p>
    </div>
  );
}

// ─── Module: Overview ────────────────────────────────────────────────────────
type RecentPurchase = {
  studentName: string;
  itemTitle: string;
  itemType: "bundle" | "mentorship";
  amount: number;
  purchasedAt: string | null;
};
type TopBundle = { title: string; revenue: number; purchaseCount: number };
type Analytics = {
  totalStudents: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalPurchases: number;
  mockTestsTaken: number;
  recentPurchases: RecentPurchase[];
  topBundles: TopBundle[];
};

function OverviewModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const data = await getAdminAnalytics({ data: { token } });
      setAnalytics(data as unknown as Analytics);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div>
        <ModuleHeader title="Executive Analytics" subtitle="Platform-wide numbers at a glance." />
        <div className="clay p-5">
          <ErrorState message="Couldn't load analytics. Check your connection and try again." onRetry={load} />
        </div>
      </div>
    );
  }

  const loading = status === "loading";

  return (
    <div>
      <ModuleHeader title="Executive Analytics" subtitle="Platform-wide numbers at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Users2}
          accent="sky"
          label="Total Students"
          loading={loading}
          value={analytics ? analytics.totalStudents.toLocaleString() : "—"}
        />
        <MetricCard
          icon={IndianRupee}
          accent="mint"
          label="Total Revenue"
          loading={loading}
          value={analytics ? currency.format(analytics.totalRevenue) : "—"}
          sub={analytics ? `${currency.format(analytics.monthlyRevenue)} this month` : undefined}
        />
        <MetricCard
          icon={ClipboardCheck}
          accent="coral"
          label="Mock Tests Taken"
          loading={loading}
          value={analytics ? analytics.mockTestsTaken.toLocaleString() : "—"}
        />
        <MetricCard
          icon={ShoppingBag}
          accent="teal"
          label="Total Purchases"
          loading={loading}
          value={analytics ? analytics.totalPurchases.toLocaleString() : "—"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent purchases feed */}
        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">Recent purchases</h2>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="clay-inset h-14 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          ) : !analytics || analytics.recentPurchases.length === 0 ? (
            <EmptyState message="No purchases yet." />
          ) : (
            <ul className="space-y-2">
              {analytics.recentPurchases.map((p, i) => (
                <li key={i} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{p.studentName}</p>
                    <p className="truncate text-xs text-foreground/50">
                      {p.itemTitle} · {formatDate(p.purchasedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      p.itemType === "bundle" ? "text-foreground/80" : "text-[var(--sky-deep)]"
                    }`}
                  >
                    {currency.format(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top bundles by revenue */}
        <div className="clay p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-foreground/60" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Top bundles by revenue
            </h2>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="clay-inset h-14 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          ) : !analytics || analytics.topBundles.length === 0 ? (
            <EmptyState message="No bundle sales yet." />
          ) : (
            <ul className="space-y-2">
              {analytics.topBundles.map((b, i) => (
                <li key={i} className="clay-inset px-4 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{b.title}</p>
                    <span className="shrink-0 text-sm font-bold text-[var(--sky-deep)]">
                      {currency.format(b.revenue)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/50">
                    {b.purchaseCount} purchase{b.purchaseCount !== 1 ? "s" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Users2;
  accent: "sky" | "teal" | "mint" | "coral";
  loading?: boolean;
}) {
  const accentVar = {
    sky: "var(--sky-soft)",
    teal: "var(--teal-soft)",
    mint: "var(--mint-soft)",
    coral: "var(--coral-soft)",
  }[accent];

  return (
    <div className="clay p-5 transition-transform duration-300 hover:-translate-y-1">
      <div
        className="clay-inset mb-3 flex h-10 w-10 items-center justify-center rounded-2xl"
        style={{ background: accentVar }}
      >
        <Icon className="h-5 w-5 text-foreground/60" />
      </div>
      {loading ? (
        <div className="h-8 w-20 animate-pulse rounded-full bg-foreground/10" />
      ) : (
        <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
      )}
      <p className="mt-1 text-xs font-medium text-foreground/60">{label}</p>
      {sub && !loading && <p className="mt-0.5 text-[11px] text-foreground/40">{sub}</p>}
    </div>
  );
}

// ─── Module: Student Directory (with 360° profile drawer) ──────────────────
type StudentRow = {
  uid: string;
  fullName: string;
  email: string | null;
  track: string;
  targetExam: string;
  deviceCount: number;
};

type StudentFullProfile = {
  profile: {
    uid: string;
    fullName: string;
    email: string | null;
    mobile: string;
    city: string;
    currentClass: string;
    board: string;
    targetExam: string;
    track: string;
    joinedAt: string | null;
  };
  purchases: { itemType: "bundle" | "mentorship"; title: string; amount: number; purchasedAt: string | null }[];
  batchPerformance: {
    bundleId: string;
    bundleTitle: string;
    testsAttempted: number;
    totalAttempts: number;
    averagePercent: number;
    bestPercent: number;
  }[];
  devices: { deviceId: string; deviceLabel: string; ip: string; lastSeenAt: string | null }[];
  tickets: {
    id: string;
    subject: string;
    message: string;
    status: string;
    itemType: "platform" | "bundle" | "mentorship";
    createdAt: string | null;
  }[];
};

function StudentsModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [openUid, setOpenUid] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const { students: rows } = await listStudents({ data: { token } });
      setStudents(rows as StudentRow[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!students) return [];
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.fullName?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
  }, [students, query]);

  return (
    <div>
      <ModuleHeader title="Student Directory" subtitle="Every onboarded student — tap a row for the full 360° view." />

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="clay-inset w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
          </div>
          {students && (
            <span className="shrink-0 text-xs text-foreground/50">
              {filtered.length} of {students.length} students
            </span>
          )}
        </div>

        {status === "loading" ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="clay-inset h-14 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : status === "error" ? (
          <ErrorState message="Couldn't load students." onRetry={load} />
        ) : students!.length === 0 ? (
          <EmptyState message="No students yet." />
        ) : filtered.length === 0 ? (
          <EmptyState message="No students match your search." />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-foreground/50">
                    <th className="px-3 pb-1">Name</th>
                    <th className="px-3 pb-1">Track</th>
                    <th className="px-3 pb-1">Target</th>
                    <th className="px-3 pb-1">Devices</th>
                    <th className="px-3 pb-1" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.uid} className="clay-inset transition-colors duration-200 hover:bg-foreground/5">
                      <td className="max-w-[220px] rounded-l-2xl px-3 py-3">
                        <p className="truncate font-medium text-foreground">{s.fullName || "—"}</p>
                        <p className="truncate text-xs text-foreground/50">{s.email}</p>
                      </td>
                      <td className="px-3 py-3 text-foreground/80">{s.track || "—"}</td>
                      <td className="px-3 py-3 text-foreground/80">{s.targetExam || "—"}</td>
                      <td className="px-3 py-3 text-foreground/80">{s.deviceCount}</td>
                      <td className="rounded-r-2xl px-3 py-3 text-right">
                        <button
                          onClick={() => setOpenUid(s.uid)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
                        >
                          View full profile
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 sm:hidden">
              {filtered.map((s) => (
                <li key={s.uid} className="clay-inset px-4 py-3">
                  <p className="truncate text-sm font-semibold text-foreground">{s.fullName || "—"}</p>
                  <p className="truncate text-xs text-foreground/50">{s.email}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground/60">
                      {s.track || "—"} · {s.targetExam || "—"}
                    </span>
                    <button
                      onClick={() => setOpenUid(s.uid)}
                      className="inline-flex items-center gap-1 font-semibold text-[var(--sky-deep)]"
                    >
                      Full profile <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {openUid && <StudentProfileDrawer uid={openUid} adminUser={adminUser} onClose={() => setOpenUid(null)} />}
    </div>
  );
}

function StudentProfileDrawer({
  uid,
  adminUser,
  onClose,
}: {
  uid: string;
  adminUser: { getIdToken: () => Promise<string> };
  onClose: () => void;
}) {
  const [data, setData] = useState<StudentFullProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const result = await getAdminStudentFullProfile({ data: { token, uid } });
      setData(result as StudentFullProfile);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="clay relative flex h-full w-full max-w-lg flex-col overflow-y-auto rounded-l-3xl rounded-r-none p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-foreground/60 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Close
          </button>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70 sm:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "loading" ? (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
          </div>
        ) : status === "error" || !data ? (
          <ErrorState message="Couldn't load this student's profile." onRetry={load} />
        ) : (
          <div className="space-y-5">
            {/* Identity */}
            <div className="clay-inset p-4">
              <div className="flex items-center gap-3">
                <div className="clay flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
                  <span className="font-display text-xl font-bold text-foreground/60">
                    {data.profile.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-foreground">{data.profile.fullName}</p>
                  <p className="text-xs text-foreground/50">Joined {formatDate(data.profile.joinedAt)}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-foreground/70">
                {data.profile.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                    {data.profile.email}
                  </p>
                )}
                {data.profile.mobile && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                    {data.profile.mobile}
                  </p>
                )}
                {data.profile.city && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                    {data.profile.city}
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="clay-chip px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                  Class: {data.profile.currentClass || "—"}
                </span>
                <span className="clay-chip px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                  Board: {data.profile.board || "—"}
                </span>
                <span className="clay-chip bg-[var(--sky-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  Target: {data.profile.targetExam}
                </span>
                <span className="clay-chip px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                  Track: {data.profile.track || "—"}
                </span>
              </div>
            </div>

            {/* Purchases */}
            <DrawerSection icon={ShoppingBag} title={`Purchases (${data.purchases.length})`}>
              {data.purchases.length === 0 ? (
                <p className="text-sm text-foreground/60">No purchases yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.purchases.map((p, i) => (
                    <li key={i} className="clay-inset flex items-center justify-between gap-2 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
                        <p className="text-xs text-foreground/50">{formatDate(p.purchasedAt)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground/80">
                        {currency.format(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>

            {/* Performance */}
            <DrawerSection icon={ClipboardCheck} title="Batch performance">
              {data.batchPerformance.length === 0 ? (
                <p className="text-sm text-foreground/60">No test attempts yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.batchPerformance.map((b) => (
                    <li key={b.bundleId} className="clay-inset px-3.5 py-3">
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-foreground">{b.bundleTitle}</span>
                        <span className="shrink-0 text-xs text-foreground/50">
                          {b.testsAttempted} tests · {b.totalAttempts} attempts
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-foreground/60">
                        <span>Avg {b.averagePercent}%</span>
                        <span>Best {b.bestPercent}%</span>
                      </div>
                      <div className="clay-inset mt-2 h-2 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            b.averagePercent < 40 ? "bg-[var(--coral-soft)]" : "bg-[var(--sky-deep)]"
                          }`}
                          style={{ width: `${b.averagePercent}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>

            {/* Devices */}
            <DrawerSection icon={Smartphone} title={`Devices (${data.devices.length})`}>
              {data.devices.length === 0 ? (
                <p className="text-sm text-foreground/60">No device history.</p>
              ) : (
                <ul className="space-y-2">
                  {data.devices.map((d) => (
                    <li key={d.deviceId} className="clay-inset px-3.5 py-2.5">
                      <p className="text-sm font-semibold text-foreground">{d.deviceLabel}</p>
                      <p className="text-xs text-foreground/50">
                        {d.ip} · {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "unknown"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>

            {/* Tickets */}
            <DrawerSection icon={LifeBuoy} title={`Tickets (${data.tickets.length})`}>
              {data.tickets.length === 0 ? (
                <p className="text-sm text-foreground/60">No tickets filed.</p>
              ) : (
                <ul className="space-y-2">
                  {data.tickets.map((t) => (
                    <li key={t.id} className="clay-inset px-3.5 py-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <SourceBadge itemType={t.itemType} />
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            t.status === "resolved"
                              ? "bg-[var(--mint-soft)] text-foreground"
                              : "bg-[var(--coral-soft)]/60 text-foreground"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-foreground/60">{t.message}</p>
                      <p className="mt-1 text-[11px] text-foreground/40">{formatDateTime(t.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>
          </div>
        )}
      </div>
    </div>
  );
}

function DrawerSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShoppingBag;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-foreground/50" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/50">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SourceBadge({ itemType, itemTitle }: { itemType: "platform" | "bundle" | "mentorship"; itemTitle?: string }) {
  if (itemType === "platform") {
    return (
      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/60">
        Platform
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        itemType === "bundle" ? "bg-[var(--sky-soft)] text-foreground" : "bg-[var(--mint-soft)] text-foreground"
      }`}
    >
      From: {itemTitle ?? (itemType === "bundle" ? "Test series" : "Mentorship batch")}
    </span>
  );
}

// ─── Module: Creator / Mentor Applications ──────────────────────────────────
type SocialLink = { platform: string; url: string };
type ApplicationStatus = "pending" | "approved" | "rejected";
type Application = {
  id: string;
  personal: { fullName: string; email: string; mobileNumber: string; city: string };
  credentials: { institution: string; yearOfStudy: string; examRank: string };
  mentorship: {
    batchTitle: string;
    targetCategory: string;
    pricingTier: string;
    // Optional so applications filed before this field existed don't break.
    examsTaught?: string[];
  };
  socialLinks: SocialLink[];
  status: ApplicationStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
};

function socialIcon(platform: string) {
  switch (platform) {
    case "YouTube":
      return Youtube;
    case "Instagram":
      return Instagram;
    case "LinkedIn":
      return Linkedin;
    case "X (Twitter)":
      return Twitter;
    case "Telegram":
      return SendIcon;
    default:
      return Link2;
  }
}

// ─── Approved-application onboarding details drawer ─────────────────────────
// Shows what the mentor filled in on the post-approval onboarding wizard
// (src/routes/mentor-onboarding/$applicationId.tsx) plus their signature
// status. Only reachable from an "approved" application card below.
type MentorOnboardingDetails = {
  profilePhotoUrl: string;
  fullName: string;
  college: string;
  rank: string;
  aboutText: string;
  weeklyHours: string;
  wantsToSellTestSeries: boolean;
  wantsToRecordIntroVideo: boolean;
  introVideoUrl: string;
  batchName: string;
  batchThumbnailUrl: string;
  needsThumbnailFromEdurack: boolean;
  batchPrice: number;
  batchDurationMonths: number;
  hasMinStudentCriteria: boolean;
  minStudentCriteriaDetails: string;
  needsPromotionAssistance: boolean;
  hasSyllabusPdf: boolean;
  syllabusPdfUrl: string;
  wantsPlannerDiscussionCall: boolean;
  expectedCommissionPercent: number;
  wantsPlatformTour: boolean;
  preferredLaunchDate: string;
  submittedAt: string | null;
  updatedAt: string | null;
  signature: {
    typedFullName: string;
    agreementUrl: string;
    agreementVersion: string;
    signedAt: string | null;
  } | null;
  profileCreated: boolean;
  mentorProfileId: string | null;
  batchCreated: boolean;
  mentorshipBatchId: string | null;
};

// ─── Credential generation for one-click mentor login creation ─────────────
function slugifyName(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug.slice(0, 16) || "mentor";
}

function randomSuffix(length = 4) {
  return Math.random().toString(36).slice(2, 2 + length);
}

function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomSecretCode() {
  return `MNT-${new Date().getFullYear()}-${randomSuffix(3).toUpperCase()}`;
}

function OnboardingDetailsDrawer({
  applicationId,
  examsTaughtHint,
  adminUser,
  onClose,
}: {
  applicationId: string;
  examsTaughtHint: string[];
  adminUser: { getIdToken: () => Promise<string> };
  onClose: () => void;
}) {
  const [details, setDetails] = useState<MentorOnboardingDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "none">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = useState<{
    username: string;
    password: string;
    secretCode: string;
  } | null>(null);

  // ─── Batch publishing form state ───────────────────────────────────────
  // Prefills whatever the onboarding wizard actually collected (name,
  // thumbnail, price) and the application's examsTaught (if one resolves
  // to a real ExamKey) — everything else (highlights, track, a crossed
  // reference price) genuinely wasn't collected anywhere, so those start
  // blank for the admin to fill in here before publishing.
  const defaultExam: ExamKey = (examsTaughtHint.find((e) => (EXAM_KEYS as string[]).includes(e)) as ExamKey) ?? "neet";
  const [batchHighlights, setBatchHighlights] = useState<string[]>(["", ""]);
  const [batchTrack, setBatchTrack] = useState<Track>("Dropper");
  const [batchExam, setBatchExam] = useState<ExamKey>(defaultExam);
  const [batchCrossedPrice, setBatchCrossedPrice] = useState("");
  const [publishingBatch, setPublishingBatch] = useState(false);
  const [publishBatchError, setPublishBatchError] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const token = await adminUser.getIdToken();
      const result = await getMentorOnboardingDetails({ data: { token, applicationId } });
      if (!result.details) {
        setStatus("none");
        return;
      }
      setDetails(result.details as MentorOnboardingDetails);
      setStatus("ready");
    } catch (err) {
      // Log the full error to the browser console for debugging, and keep
      // a short version on screen so it's visible without opening dev
      // tools — a bare "couldn't load" message hides exactly the info
      // needed to fix whatever actually broke (expired token, missing
      // admin claim, a mismatched import in the server function, etc.).
      console.error("getMentorOnboardingDetails failed:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  // Creating a "mentor profile" here means creating a real mentor LOGIN —
  // that's what src/lib/admin-types.ts's Mentor type and MentorList
  // actually are (username + hashed password + secretCode), the same
  // system the "Onboard a mentor" form in Mentor Hub already uses. Rather
  // than inserting a differently-shaped document straight into that same
  // "mentors" collection (which is what broke MentorList earlier), this
  // reuses the existing, already-correct createMentor / updateMentorProfile
  // / updateMentorLockedInfo functions — just auto-fills them with what
  // was reviewed above, plus freshly generated credentials.
  //
  // Note: this deliberately does NOT auto-create a mentorship batch. The
  // batch price/duration collected during onboarding don't map cleanly
  // onto MentorshipBatch's required fields (highlights, Track, ExamKey
  // aren't collected in the onboarding wizard at all), so guessing those
  // would risk creating a malformed batch the same way the old mentor
  // insert did. Use the batch details shown above to fill in "Create
  // mentorship batch" in Mentor Hub yourself, with this mentor selected
  // in the assignment dropdown.
  async function handleCreateProfile() {
    if (!details) return;
    setCreatingProfile(true);
    setCreateProfileError(null);
    try {
      const token = await adminUser.getIdToken();
      const baseUsername = slugifyName(details.fullName);
      const password = randomPassword();
      const secretCode = randomSecretCode();

      let mentorId: string | null = null;
      let usedUsername = "";
      let lastError: unknown = null;

      // A couple of retries with a random suffix in case the base
      // username collides with an existing mentor login.
      for (let attempt = 0; attempt < 5 && !mentorId; attempt++) {
        const candidate = attempt === 0 ? baseUsername : `${baseUsername}${randomSuffix(3)}`;
        try {
          const result = await createMentor({
            data: { token, mentor: { username: candidate, password, secretCode, name: details.fullName } },
          });
          mentorId = result.id;
          usedUsername = candidate;
        } catch (err) {
          lastError = err;
        }
      }
      if (!mentorId) throw lastError instanceof Error ? lastError : new Error("Could not create a mentor login.");

      await updateMentorProfile({
        data: {
          token,
          id: mentorId,
          profile: { name: details.fullName, profilePictureUrl: details.profilePhotoUrl || null, trackingIndex: "" },
        },
      });

      await updateMentorLockedInfo({
        data: {
          token,
          mentorId,
          lockedInfo: {
            aiimsIitRank: details.rank || "Not specified",
            enrolledCollege: details.college || "Not specified",
            pursuedCourse: "Not specified",
          },
        },
      });

      await markMentorProfileCreated({ data: { token, applicationId, mentorId } });

      setGeneratedCredentials({ username: usedUsername, password, secretCode });
      await load();
    } catch (err) {
      console.error("Create profile failed:", err);
      setCreateProfileError(err instanceof Error ? err.message : "Could not create the profile. Try again.");
    } finally {
      setCreatingProfile(false);
    }
  }

  // Publishes the mentorship batch using createMentorshipBatch — the same
  // function "Create mentorship batch" in Mentor Hub uses, so the result
  // is indistinguishable from one created there by hand. Requires a
  // mentor profile to already exist (mentorProfileId), since a batch has
  // to be assigned to someone.
  async function handlePublishBatch() {
    if (!details || !details.mentorProfileId) return;
    setPublishBatchError(null);

    const cleanHighlights = batchHighlights.map((h) => h.trim()).filter(Boolean);
    if (cleanHighlights.length < 2) return setPublishBatchError("Add at least 2 highlights for this batch.");
    const selling = details.batchPrice;
    const crossed = Number(batchCrossedPrice);
    if (!selling || selling <= 0) return setPublishBatchError("The batch price from onboarding looks invalid.");
    if (!crossed || crossed <= selling) return setPublishBatchError("Crossed price must be higher than the selling price.");

    setPublishingBatch(true);
    try {
      const token = await adminUser.getIdToken();
      const result = await createMentorshipBatch({
        data: {
          token,
          batch: {
            thumbnailUrl: details.batchThumbnailUrl || null,
            name: details.batchName,
            highlights: cleanHighlights,
            track: batchTrack,
            exam: batchExam,
            sellingPrice: selling,
            crossedPrice: crossed,
            assignedMentorId: details.mentorProfileId,
          },
        },
      });
      await markMentorshipBatchLinked({ data: { token, applicationId, mentorshipBatchId: result.id } });
      await load();
    } catch (err) {
      console.error("Publish batch failed:", err);
      setPublishBatchError(err instanceof Error ? err.message : "Could not publish the batch. Try again.");
    } finally {
      setPublishingBatch(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="clay relative flex h-full w-full max-w-lg flex-col overflow-y-auto rounded-l-3xl rounded-r-none p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-foreground/60 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Close
          </button>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70 sm:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "loading" ? (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-24 animate-pulse rounded-2xl bg-foreground/5" />
          </div>
        ) : status === "none" ? (
          <EmptyState message="This mentor hasn't submitted onboarding details yet." />
        ) : status === "error" ? (
          <div className="space-y-3">
            <ErrorState message="Couldn't load onboarding details." onRetry={load} />
            {errorMessage && (
              <div className="clay-inset rounded-2xl bg-[var(--coral-soft)]/20 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40">
                  Error detail (for debugging)
                </p>
                <p className="break-words font-mono text-xs text-foreground/70">{errorMessage}</p>
              </div>
            )}
          </div>
        ) : details ? (
          <div className="space-y-4 text-sm">
            {/* Identity / bio */}
            <div className="clay-inset p-4">
              <div className="flex items-center gap-3">
                <div className="clay flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  {details.profilePhotoUrl ? (
                    <img src={details.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-xl font-bold text-foreground/60">
                      {details.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-foreground">{details.fullName}</p>
                  <p className="truncate text-xs text-foreground/50">
                    {details.college} {details.rank ? `· ${details.rank}` : ""}
                  </p>
                </div>
              </div>
              {details.aboutText && (
                <p className="mt-3 whitespace-pre-line text-foreground/70">{details.aboutText}</p>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground/50">
                <Calendar className="h-3 w-3" />
                Weekly commitment: {details.weeklyHours || "—"}
              </p>
            </div>

            {/* Batch */}
            <DrawerSection icon={GraduationCap} title="Proposed batch">
              <div className="clay-inset px-3.5 py-3">
                {details.batchThumbnailUrl && (
                  <div className="mb-2.5 h-24 w-full overflow-hidden rounded-xl bg-foreground/5">
                    <img src={details.batchThumbnailUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <p className="font-semibold text-foreground">{details.batchName || "—"}</p>
                <p className="mt-0.5 text-xs text-foreground/50">
                  {currency.format(details.batchPrice || 0)} · {details.batchDurationMonths || 0} month
                  {details.batchDurationMonths === 1 ? "" : "s"} ·{" "}
                  {details.hasMinStudentCriteria
                    ? details.minStudentCriteriaDetails || "Has criteria"
                    : "Open to all"}
                </p>
                {details.needsThumbnailFromEdurack && (
                  <p className="mt-1 text-xs font-semibold text-[var(--sky-deep)]">
                    Requested a thumbnail from EDURACK
                  </p>
                )}
              </div>
            </DrawerSection>

            {/* Everything else */}
            <DrawerSection icon={ListChecks} title="Onboarding answers">
              <ul className="clay-inset space-y-1.5 px-3.5 py-3 text-foreground/70">
                <li>
                  Sell test series too: <strong className="text-foreground">{details.wantsToSellTestSeries ? "Yes" : "No"}</strong>
                </li>
                <li>
                  Intro video:{" "}
                  <strong className="text-foreground">
                    {details.wantsToRecordIntroVideo ? details.introVideoUrl || "Yes, pending" : "No"}
                  </strong>
                </li>
                <li>
                  Needs promotion assistance:{" "}
                  <strong className="text-foreground">{details.needsPromotionAssistance ? "Yes" : "No"}</strong>
                </li>
                <li>
                  Syllabus/planner:{" "}
                  <strong className="text-foreground">
                    {details.hasSyllabusPdf
                      ? details.syllabusPdfUrl || "Provided"
                      : details.wantsPlannerDiscussionCall
                        ? "Wants a planning call"
                        : "Not provided"}
                  </strong>
                </li>
                <li>
                  Expected commission: <strong className="text-foreground">{details.expectedCommissionPercent}%</strong>
                </li>
                <li>
                  Wants platform tour: <strong className="text-foreground">{details.wantsPlatformTour ? "Yes" : "No"}</strong>
                </li>
                <li>
                  Preferred launch date:{" "}
                  <strong className="text-foreground">{formatDate(details.preferredLaunchDate) !== "—" ? formatDate(details.preferredLaunchDate) : details.preferredLaunchDate || "—"}</strong>
                </li>
              </ul>
            </DrawerSection>

            {/* Agreement / signature */}
            <div
              className={`clay-inset rounded-2xl p-4 ${
                details.signature ? "bg-[var(--mint-soft)]/30" : "bg-[var(--coral-soft)]/30"
              }`}
            >
              {details.signature ? (
                <>
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    Agreement signed
                  </p>
                  <p className="mt-1 text-xs text-foreground/60">
                    Signed as "{details.signature.typedFullName}" on {formatDateTime(details.signature.signedAt)} ·
                    version {details.signature.agreementVersion}
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <AlertCircle className="h-4 w-4" />
                  Agreement not yet signed
                </p>
              )}
            </div>

            {/* Create profile — the actual "add this mentor to the portal"
                action, gated on having reviewed a signed submission. */}
            <div className="clay-inset rounded-2xl p-4">
              {details.profileCreated ? (
                <>
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-[var(--sky-deep)]" />
                    Mentor login created
                  </p>
                  {generatedCredentials ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-amber-700">
                        Save these now — the password won't be shown again. Share them with the mentor
                        directly.
                      </p>
                      <div className="clay-inset space-y-1 rounded-2xl bg-[var(--mint-soft)]/30 px-4 py-3 font-mono text-xs text-foreground/80">
                        <p>Username: {generatedCredentials.username}</p>
                        <p>Password: {generatedCredentials.password}</p>
                        <p>Secret code: {generatedCredentials.secretCode}</p>
                      </div>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(
                            `Username: ${generatedCredentials.username}\nPassword: ${generatedCredentials.password}\nSecret code: ${generatedCredentials.secretCode}`,
                          )
                        }
                        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy credentials
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-foreground/50">
                      Login credentials were generated when this was created — they're not stored in
                      plain text, so they can't be shown again from here.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-foreground/60">
                    {details.signature
                      ? "Creates this mentor's login (username, password, secret code) from what they submitted above. You'll publish their mentorship batch next."
                      : "This mentor needs to confirm the agreement before a profile can be created."}
                  </p>
                  <button
                    onClick={handleCreateProfile}
                    disabled={!details.signature || creatingProfile}
                    className="clay-btn inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Create Profile
                  </button>
                  {createProfileError && (
                    <p className="mt-2 text-xs font-medium text-rose-600">{createProfileError}</p>
                  )}
                </>
              )}
            </div>

            {/* Publish mentorship batch — only once the mentor login
                exists (a batch has to be assigned to somebody). Everything
                already known from onboarding is shown read-only; the
                genuinely-missing fields (highlights, track, exam, a
                crossed reference price) are filled in here before
                publishing for real via createMentorshipBatch. */}
            {details.profileCreated && (
              <div className="clay-inset rounded-2xl p-4">
                {details.batchCreated ? (
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-[var(--sky-deep)]" />
                    Batch published — live on the student dashboard
                  </p>
                ) : (
                  <>
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                      <Layers3 className="h-3.5 w-3.5" />
                      Publish mentorship batch
                    </p>

                    {details.batchThumbnailUrl && (
                      <div className="mb-2.5 h-20 w-full overflow-hidden rounded-xl bg-foreground/5">
                        <img src={details.batchThumbnailUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <p className="text-sm font-semibold text-foreground">{details.batchName || "—"}</p>
                    <p className="mb-3 text-xs text-foreground/50">
                      {currency.format(details.batchPrice || 0)} · {details.batchDurationMonths || 0} month
                      {details.batchDurationMonths === 1 ? "" : "s"} (from onboarding)
                    </p>

                    <div className="space-y-2.5">
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                          Highlights (min. 2)
                        </p>
                        <div className="space-y-1.5">
                          {batchHighlights.map((h, i) => (
                            <input
                              key={i}
                              value={h}
                              onChange={(e) => {
                                const next = [...batchHighlights];
                                next[i] = e.target.value;
                                setBatchHighlights(next);
                              }}
                              placeholder={`Highlight ${i + 1}`}
                              className="clay-inset w-full rounded-2xl px-3.5 py-2 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none"
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                          Track
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["11th", "12th", "Dropper"] as Track[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setBatchTrack(t)}
                              className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-all ${
                                batchTrack === t ? "clay-btn text-white" : "clay-chip text-foreground/70"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                          Exam
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {EXAM_KEYS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => setBatchExam(e)}
                              className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-all ${
                                batchExam === e ? "clay-btn text-white" : "clay-chip text-foreground/70"
                              }`}
                            >
                              {EXAM_LABEL_MAP[e]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                          Crossed price (₹) — the strike-through reference price
                        </p>
                        <input
                          value={batchCrossedPrice}
                          onChange={(e) => setBatchCrossedPrice(e.target.value)}
                          inputMode="numeric"
                          placeholder={`Higher than ₹${details.batchPrice}`}
                          className="clay-inset w-full rounded-2xl px-3.5 py-2 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none"
                        />
                      </div>
                    </div>

                    {publishBatchError && (
                      <p className="mt-2 text-xs font-medium text-rose-600">{publishBatchError}</p>
                    )}

                    <button
                      onClick={handlePublishBatch}
                      disabled={publishingBatch}
                      className="clay-btn mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {publishingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
                      Publish Batch
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Builds the public onboarding wizard link for an approved application —
// see src/routes/mentor-onboarding/$applicationId.tsx. Nothing sends this
// automatically yet, so this is the admin's only way to hand it to the
// mentor (email, WhatsApp, wherever) until an auto-send is wired up.
function onboardingLinkFor(applicationId: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/mentor-onboarding/${applicationId}`;
}

function CopyLinkButton({ applicationId }: { applicationId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const link = onboardingLinkFor(applicationId);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on non-secure contexts / older browsers —
      // fall back to a prompt so the admin can still grab the link.
      window.prompt("Copy the onboarding link:", link);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--sky-deep)]" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy onboarding link
        </>
      )}
    </button>
  );
}

type AppStatusFilter = "pending" | "approved" | "rejected" | "all";

function ApplicationsModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppStatusFilter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [onboardingApp, setOnboardingApp] = useState<Application | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const { applications: rows } = await listCreatorApplications({ data: { token } });
      setApplications(rows as Application[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const token = await adminUser.getIdToken();
      await approveCreatorApplication({ data: { token, applicationId: id } });
      setApplications(
        (prev) =>
          prev?.map((a) => (a.id === id ? { ...a, status: "approved", rejectionReason: null } : a)) ?? null,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    setBusyId(id);
    try {
      const token = await adminUser.getIdToken();
      await rejectCreatorApplication({ data: { token, applicationId: id, reason: rejectReason } });
      setApplications(
        (prev) =>
          prev?.map((a) => (a.id === id ? { ...a, status: "rejected", rejectionReason: rejectReason.trim() } : a)) ??
          null,
      );
      setRejectingId(null);
      setRejectReason("");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReopen(id: string) {
    setBusyId(id);
    try {
      const token = await adminUser.getIdToken();
      await reopenCreatorApplication({ data: { token, applicationId: id } });
      setApplications(
        (prev) => prev?.map((a) => (a.id === id ? { ...a, status: "pending", rejectionReason: null } : a)) ?? null,
      );
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!applications) return [];
    const q = query.trim().toLowerCase();
    return applications.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      const examMatch = (a.mentorship.examsTaught ?? []).some(
        (exam) => exam.toLowerCase().includes(q) || (EXAM_LABELS[exam] ?? "").toLowerCase().includes(q),
      );
      if (
        q &&
        !a.personal.fullName.toLowerCase().includes(q) &&
        !a.mentorship.batchTitle.toLowerCase().includes(q) &&
        !a.credentials.institution.toLowerCase().includes(q) &&
        !examMatch
      )
        return false;
      return true;
    });
  }, [applications, query, statusFilter]);

  const pendingCount = applications?.filter((a) => a.status === "pending").length ?? 0;

  return (
    <div>
      <ModuleHeader title="Mentor Applications" subtitle="Review creator applications from the public onboarding form." />

      {applications && pendingCount > 0 && (
        <div className="clay-inset mb-4 flex items-center gap-2 rounded-2xl bg-[var(--sky-soft)]/50 px-4 py-3 text-sm text-foreground/70">
          <UserPlus className="h-4 w-4 shrink-0" />
          <p>
            <strong>{pendingCount}</strong> application{pendingCount !== 1 ? "s" : ""} awaiting review.
          </p>
        </div>
      )}

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, institution, batch, or exam (NEET/JEE/CUET/IPMAT)…"
              className="clay-inset w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "rejected", "all"] as AppStatusFilter[]).map((f) => (
              <FilterChip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </FilterChip>
            ))}
          </div>
        </div>

        {status === "loading" ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="clay-inset h-48 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : status === "error" ? (
          <ErrorState message="Couldn't load applications." onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            message={applications && applications.length > 0 ? "No applications match your filters." : "No applications yet."}
          />
        ) : (
          <ul className="space-y-4">
            {filtered.map((app) => (
              <li key={app.id} className="clay-inset rounded-2xl p-4 sm:p-5">
                {/* Header row */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-base font-bold text-foreground">{app.personal.fullName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/50">
                      <Calendar className="h-3 w-3" />
                      Applied {formatDate(app.submittedAt)}
                    </p>
                  </div>
                  <StatusPill status={app.status} />
                </div>

                {/* Contact */}
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-foreground/60">
                  <a href={`mailto:${app.personal.email}`} className="inline-flex items-center gap-1 text-[var(--sky-deep)] hover:underline">
                    <Mail className="h-3 w-3" />
                    {app.personal.email}
                  </a>
                  <a href={`tel:${app.personal.mobileNumber}`} className="inline-flex items-center gap-1 text-[var(--sky-deep)] hover:underline">
                    <Phone className="h-3 w-3" />
                    {app.personal.mobileNumber}
                  </a>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {app.personal.city}
                  </span>
                </div>

                {/* Credentials + mentorship intent */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="clay px-3.5 py-2.5">
                    <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                      <Building2 className="h-3 w-3" />
                      Institution
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">{app.credentials.institution}</p>
                    <p className="text-xs text-foreground/50">
                      {app.credentials.yearOfStudy} · {app.credentials.examRank}
                    </p>
                  </div>
                  <div className="clay px-3.5 py-2.5">
                    <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                      <GraduationCap className="h-3 w-3" />
                      Proposed batch
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">{app.mentorship.batchTitle}</p>
                    <p className="text-xs text-foreground/50">
                      {app.mentorship.targetCategory} · {app.mentorship.pricingTier}
                    </p>
                  </div>
                </div>

                {/* Exams applied to mentor for */}
                {app.mentorship.examsTaught && app.mentorship.examsTaught.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                      Mentoring for:
                    </span>
                    {app.mentorship.examsTaught.map((exam) => (
                      <span
                        key={exam}
                        className="rounded-full bg-[var(--sky-deep)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
                      >
                        {EXAM_LABELS[exam] ?? exam}
                      </span>
                    ))}
                  </div>
                )}

                {/* Social links */}
                {app.socialLinks.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {app.socialLinks.map((l, i) => {
                      const Icon = socialIcon(l.platform);
                      const href = /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`;
                      return (
                        <a
                          key={i}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="clay-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground/70 transition-colors duration-200 hover:text-[var(--sky-deep)]"
                        >
                          <Icon className="h-3 w-3" />
                          {l.platform}
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Rejection reason, if any */}
                {app.status === "rejected" && app.rejectionReason && (
                  <div className="clay-inset mt-3 rounded-xl bg-[var(--coral-soft)]/30 px-4 py-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-foreground/40">
                      Rejection reason
                    </p>
                    <p className="text-sm text-foreground/80">{app.rejectionReason}</p>
                  </div>
                )}

                {/* Actions */}
                {rejectingId === app.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why this application is being rejected…"
                      rows={2}
                      className="clay-inset w-full rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(app.id)}
                        disabled={busyId === app.id || !rejectReason.trim()}
                        className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {busyId === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                        Confirm rejection
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="clay-btn-ghost rounded-full px-4 py-2 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {app.status !== "approved" && (
                      <button
                        onClick={() => handleApprove(app.id)}
                        disabled={busyId === app.id}
                        className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        {busyId === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                        Approve
                      </button>
                    )}
                    {app.status !== "rejected" && (
                      <button
                        onClick={() => setRejectingId(app.id)}
                        disabled={busyId === app.id}
                        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    )}
                    {app.status !== "pending" && (
                      <button
                        onClick={() => handleReopen(app.id)}
                        disabled={busyId === app.id}
                        className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reopen
                      </button>
                    )}
                    {app.status === "approved" && (
                      <>
                        <CopyLinkButton applicationId={app.id} />
                        <button
                          onClick={() => setOnboardingApp(app)}
                          className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View onboarding details
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {onboardingApp && (
        <OnboardingDetailsDrawer
          applicationId={onboardingApp.id}
          examsTaughtHint={onboardingApp.mentorship.examsTaught ?? []}
          adminUser={adminUser}
          onClose={() => setOnboardingApp(null)}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, string> = {
    pending: "bg-[var(--sky-soft)] text-foreground",
    approved: "bg-[var(--mint-soft)] text-foreground",
    rejected: "bg-[var(--coral-soft)]/60 text-foreground",
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

// ─── Module: Support Tickets ─────────────────────────────────────────────────
type AdminTicket = {
  id: string;
  uid: string;
  studentName: string;
  studentEmail: string | null;
  studentMobile: string | null;
  subject: string;
  message: string;
  status: string;
  source: { type: "platform" } | { type: "bundle" | "mentorship"; itemTitle: string };
  adminReply: string | null;
  rating: number | null;
  createdAt: string | null;
  repliedAt: string | null;
};

type SourceFilter = "all" | "platform" | "bundle" | "mentorship";
type StatusFilter = "all" | "open" | "resolved";

function TicketsModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const { tickets: rows } = await listAllTicketsAdmin({ data: { token } });
      setTickets(rows as AdminTicket[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!tickets) return [];
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (sourceFilter !== "all" && t.source.type !== sourceFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !(t.studentName.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tickets, query, sourceFilter, statusFilter]);

  const openCount = tickets?.filter((t) => t.status !== "resolved").length ?? 0;

  return (
    <div>
      <ModuleHeader title="Support Tickets" subtitle="Every ticket a student has filed, with where it came from." />

      {tickets && openCount > 0 && (
        <div className="clay-inset mb-4 flex items-center gap-2 rounded-2xl bg-[var(--coral-soft)]/30 px-4 py-3 text-sm text-foreground/70">
          <MessageSquareText className="h-4 w-4 shrink-0" />
          <p>
            <strong>{openCount}</strong> ticket{openCount !== 1 ? "s" : ""} still open.
          </p>
        </div>
      )}

      <div className="clay p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by student or subject…"
              className="clay-inset w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "platform", "bundle", "mentorship"] as SourceFilter[]).map((f) => (
              <FilterChip key={f} active={sourceFilter === f} onClick={() => setSourceFilter(f)}>
                {f === "all" ? "All sources" : f === "platform" ? "Platform" : f === "bundle" ? "Test series" : "Mentorship"}
              </FilterChip>
            ))}
            <span className="mx-1 hidden text-foreground/20 sm:inline">|</span>
            {(["all", "open", "resolved"] as StatusFilter[]).map((f) => (
              <FilterChip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)}>
                {f === "all" ? "All statuses" : f === "open" ? "Open" : "Resolved"}
              </FilterChip>
            ))}
          </div>
        </div>

        {status === "loading" ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="clay-inset h-32 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : status === "error" ? (
          <ErrorState message="Couldn't load tickets." onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState message={tickets && tickets.length > 0 ? "No tickets match your filters." : "No tickets filed yet."} />
        ) : (
          <ul className="space-y-3">
            {filtered.map((t) => (
              <AdminTicketCard
                key={t.id}
                ticket={t}
                adminUser={adminUser}
                onReplied={(reply) =>
                  setTickets(
                    (prev) =>
                      prev?.map((row) =>
                        row.id === t.id ? { ...row, adminReply: reply, status: "resolved" } : row,
                      ) ?? null,
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminTicketCard({
  ticket,
  adminUser,
  onReplied,
}: {
  ticket: AdminTicket;
  adminUser: { getIdToken: () => Promise<string> };
  onReplied: (reply: string) => void;
}) {
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);

  async function sendReply() {
    if (!replyDraft.trim()) return;
    setSending(true);
    try {
      const token = await adminUser.getIdToken();
      await replyToTicket({ data: { token, ticketId: ticket.id, reply: replyDraft } });
      onReplied(replyDraft.trim());
      setReplyDraft("");
      setShowReplyBox(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="clay-inset rounded-2xl p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge
            itemType={ticket.source.type}
            itemTitle={ticket.source.type !== "platform" ? ticket.source.itemTitle : undefined}
          />
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              ticket.status === "resolved"
                ? "bg-[var(--mint-soft)] text-foreground"
                : "bg-[var(--coral-soft)]/60 text-foreground"
            }`}
          >
            {ticket.status}
          </span>
        </div>
        <span className="text-xs text-foreground/40">{formatDateTime(ticket.createdAt)}</span>
      </div>

      <p className="text-sm font-semibold text-foreground">{ticket.subject}</p>
      <p className="mt-1 text-sm text-foreground/70">{ticket.message}</p>

      {/* Contact details — the whole point: reach the student without
          hunting through the student directory. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-foreground/60">
        <span className="font-semibold text-foreground">{ticket.studentName}</span>
        {ticket.studentEmail && (
          <a
            href={`mailto:${ticket.studentEmail}`}
            className="inline-flex items-center gap-1 text-[var(--sky-deep)] hover:underline"
          >
            <Mail className="h-3 w-3" />
            {ticket.studentEmail}
          </a>
        )}
        {ticket.studentMobile && (
          <a href={`tel:${ticket.studentMobile}`} className="inline-flex items-center gap-1 text-[var(--sky-deep)] hover:underline">
            <Phone className="h-3 w-3" />
            {ticket.studentMobile}
          </a>
        )}
        {!ticket.studentEmail && !ticket.studentMobile && (
          <span className="italic text-foreground/35">No contact details on file (filed before this was tracked)</span>
        )}
      </div>

      {ticket.adminReply ? (
        <div className="clay-inset mt-3 rounded-xl px-4 py-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/40">Your reply</p>
            {ticket.rating ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/60">
                <Star className="h-3 w-3 fill-[var(--sky-deep)] text-[var(--sky-deep)]" />
                Rated {ticket.rating}/5
              </span>
            ) : (
              <span className="text-[10px] text-foreground/35">Awaiting student rating</span>
            )}
          </div>
          <p className="text-sm text-foreground/80">{ticket.adminReply}</p>
        </div>
      ) : showReplyBox ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Write a reply to the student…"
            rows={3}
            className="clay-inset w-full rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={sendReply}
              disabled={sending || !replyDraft.trim()}
              className="clay-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send reply & resolve
            </button>
            <button
              onClick={() => setShowReplyBox(false)}
              className="clay-btn-ghost rounded-full px-4 py-2 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowReplyBox(true)}
          className="clay-btn-ghost mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Reply to student
        </button>
      )}
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
        active ? "clay-btn text-white" : "clay-chip text-foreground/70"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Module: Danger Zone — cascade-safe deletion ────────────────────────────
type DeletableBundle = { id: string; title: string; track: string; testCount: number; purchaseCount: number };
type DeletableTestCore = { id: string; name: string; bundleTitle: string; questionCount: number; attemptCount: number };

function DangerZoneModule({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [tab, setTab] = useState<"bundles" | "tests">("bundles");
  const [bundles, setBundles] = useState<DeletableBundle[] | null>(null);
  const [testCores, setTestCores] = useState<DeletableTestCore[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [target, setTarget] = useState<{ kind: "bundle" | "test"; id: string; label: string } | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const token = await adminUser.getIdToken();
      const [{ bundles: b }, { testCores: t }] = await Promise.all([
        listBundlesForDeletion({ data: { token } }),
        listTestCoresForDeletion({ data: { token } }),
      ]);
      setBundles(b as DeletableBundle[]);
      setTestCores(t as DeletableTestCore[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmDelete() {
    if (!target) return;
    const token = await adminUser.getIdToken();
    if (target.kind === "bundle") {
      await deleteBundle({ data: { token, bundleId: target.id } });
      setBundles((prev) => prev?.filter((b) => b.id !== target.id) ?? null);
    } else {
      await deleteTestCore({ data: { token, testId: target.id } });
      setTestCores((prev) => prev?.filter((t) => t.id !== target.id) ?? null);
    }
    setTarget(null);
  }

  return (
    <div>
      <ModuleHeader
        title="Danger Zone"
        subtitle="Permanently delete bundles and test series — every dependent record goes with them."
      />

      <div className="clay-inset mb-4 flex items-start gap-2 rounded-2xl bg-[var(--coral-soft)]/30 px-4 py-3 text-sm text-foreground/70">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Deleting a bundle removes every test, question, purchase, and student attempt tied to it.
          This cannot be undone. Deleting a test series removes its questions and every student's
          attempts on it.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <FilterChip active={tab === "bundles"} onClick={() => setTab("bundles")}>
          Bundles {bundles ? `(${bundles.length})` : ""}
        </FilterChip>
        <FilterChip active={tab === "tests"} onClick={() => setTab("tests")}>
          Test Series {testCores ? `(${testCores.length})` : ""}
        </FilterChip>
      </div>

      <div className="clay p-5 sm:p-6">
        {status === "loading" ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="clay-inset h-16 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : status === "error" ? (
          <ErrorState message="Couldn't load deletable items." onRetry={load} />
        ) : tab === "bundles" ? (
          !bundles || bundles.length === 0 ? (
            <EmptyState message="No bundles exist." />
          ) : (
            <ul className="space-y-2">
              {bundles.map((b) => (
                <li key={b.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{b.title}</p>
                    <p className="text-xs text-foreground/50">
                      {b.track || "No track"} · {b.testCount} test{b.testCount !== 1 ? "s" : ""} ·{" "}
                      {b.purchaseCount} purchase{b.purchaseCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setTarget({ kind: "bundle", id: b.id, label: b.title })}
                    className="clay-btn-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-[var(--coral-soft)] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : !testCores || testCores.length === 0 ? (
          <EmptyState message="No test series exist." />
        ) : (
          <ul className="space-y-2">
            {testCores.map((t) => (
              <li key={t.id} className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-foreground/50">
                    {t.bundleTitle} · {t.questionCount} question{t.questionCount !== 1 ? "s" : ""} ·{" "}
                    {t.attemptCount} attempt{t.attemptCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setTarget({ kind: "test", id: t.id, label: t.name })}
                  className="clay-btn-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-[var(--coral-soft)] transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {target && (
        <ConfirmDeleteDialog
          label={target.label}
          kind={target.kind}
          onCancel={() => setTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function ConfirmDeleteDialog({
  label,
  kind,
  onCancel,
  onConfirm,
}: {
  label: string;
  kind: "bundle" | "test";
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = typed.trim() === label.trim();

  async function handleConfirm() {
    if (!matches) return;
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="clay w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <div className="clay-inset grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--coral-soft)]/40">
            <AlertCircle className="h-5 w-5 text-foreground/70" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-foreground">
              Delete this {kind === "bundle" ? "bundle" : "test series"}?
            </h3>
            <p className="text-xs text-foreground/50">This action is permanent and cannot be undone.</p>
          </div>
        </div>

        <p className="mb-3 text-sm text-foreground/70">
          Type <strong className="text-foreground">{label}</strong> below to confirm.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={label}
          className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
        />

        <div className="mt-5 flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={!matches || deleting}
            className="clay-btn inline-flex items-center gap-1.5 rounded-full bg-[var(--coral-soft)] px-5 py-2.5 text-sm font-semibold text-foreground transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete permanently
          </button>
          <button
            onClick={onCancel}
            className="clay-btn-ghost rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}