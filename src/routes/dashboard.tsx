import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { IconLoader2 as Loader2, IconSearch as Search, IconBook2 as BookOpen, IconUsersGroup as Users2, IconArrowRight as ArrowRight, IconChevronRight as ChevronRight, IconSchool as GraduationCap, IconStar as Star, IconRosetteDiscountCheck as BadgeCheck, IconTag as Tag, IconClipboardList as ClipboardList, IconX as X, IconGift as Gift, IconUsers as UsersGroupIcon, IconClock as Clock, IconHome as Home, IconCompass as Compass, IconCalendarEvent as CalendarDays, IconLifebuoy as LifeBuoy, IconReceipt as Receipt, IconLink as LinkIcon, IconPlayerPlayFilled as Play } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/server-functions/profile";
import { listPublicBundles, listPublicMentorshipBatches, listPublicMentors, listPublicSoldTests } from "@/server-functions/catalog";
import { getMyPurchases, getMyBatchPerformance } from "@/server-functions/student-data";
import { listOpenMentorSessions, listMyBookedSessions } from "@/server-functions/student-sessions";
import { StudentOpenSessionsModule, BookingDialog } from "@/components/student-open-sessions-module";
import { AppHeader } from "@/components/app-header";
import type { OpenSlot, PublicMentorOffering } from "@/lib/session-types";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

type Track = "Dropper" | "11th" | "12th" | "";
type TrackFilter = "All" | "Dropper" | "11th" | "12th";
type ExamKey = "neet" | "jee" | "cuet" | "ipmat";
type ExamFilter = "All" | ExamKey;

const EXAM_LABELS: Record<ExamKey, string> = {
  neet: "NEET",
  jee: "JEE",
  cuet: "CUET",
  ipmat: "IPMAT",
};

function resolveExamKey(targetExam: string): ExamKey | null {
  const t = targetExam.toLowerCase();
  if (t.includes("neet")) return "neet";
  if (t.includes("jee")) return "jee";
  if (t.includes("cuet")) return "cuet";
  if (t.includes("ipmat")) return "ipmat";
  return null;
}

type StudentProfile = {
  fullName: string;
  targetExam: string;
  track: Track;
};

type Bundle = {
  id: string;
  title: string;
  track: string;
  exam?: ExamKey;
  features: string[];
  sellingPrice: number;
  crossedPrice: number;
  discountPercent: number;
  expiryDate: string;
  thumbnailUrl: string | null;
};

type MentorshipBatch = {
  id: string;
  name: string;
  track: string;
  exam?: ExamKey;
  highlights: string[];
  sellingPrice: number;
  crossedPrice: number;
  discountPercent: number;
  thumbnailUrl: string | null;
  mentorName: string | null;
};

type MentorDirectoryEntry = {
  id: string;
  name: string;
  profilePictureUrl: string | null;
  yearOfStudy: string;
  aboutText: string;
  avgRating: number | null;
  reviewCount: number;
  batches: { id: string; name: string; track: string }[];
  searchText: string;
};

type SoldTestEntry = {
  id: string;
  name: string;
  mentorName: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  price: number;
  purchased: boolean;
  searchText: string;
};

function soldTestToEntry(t: {
  id: string;
  name: string;
  mentorName: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  price: number;
}, purchasedKeys: Set<string>): SoldTestEntry {
  return {
    ...t,
    purchased: purchasedKeys.has(`mentorTest:${t.id}`),
    searchText: `${t.name} ${t.mentorName} ${t.subjects.join(" ")}`.toLowerCase(),
  };
}

type Listing = {
  id: string;
  kind: "Test Series" | "Mentorship";
  title: string;
  track: string;
  exam: ExamKey;
  thumbnailUrl: string | null;
  sellingPrice: number;
  crossedPrice: number;
  discountPercent: number;
  metaLine: string;
  metaIcon: typeof BookOpen;
  searchText: string;
  purchased: boolean;
};

function bundleToListing(b: Bundle, purchasedKeys: Set<string>): Listing {
  const exam = b.exam ?? "neet";
  return {
    id: b.id,
    kind: "Test Series",
    title: b.title,
    track: b.track,
    exam,
    thumbnailUrl: b.thumbnailUrl,
    sellingPrice: b.sellingPrice,
    crossedPrice: b.crossedPrice,
    discountPercent: b.discountPercent,
    metaLine: b.features[0] ?? `${EXAM_LABELS[exam]} test series`,
    metaIcon: BookOpen,
    searchText: `${b.title} ${b.track} ${EXAM_LABELS[exam]} ${b.features.join(" ")}`.toLowerCase(),
    purchased: purchasedKeys.has(`bundle:${b.id}`),
  };
}

function batchToListing(b: MentorshipBatch, purchasedKeys: Set<string>): Listing {
  const exam = b.exam ?? "neet";
  return {
    id: b.id,
    kind: "Mentorship",
    title: b.name,
    track: b.track,
    exam,
    thumbnailUrl: b.thumbnailUrl,
    sellingPrice: b.sellingPrice,
    crossedPrice: b.crossedPrice,
    discountPercent: b.discountPercent,
    metaLine: b.mentorName ? `Mentor: ${b.mentorName}` : "Mentor: unassigned",
    metaIcon: Users2,
    searchText: `${b.name} ${b.track} ${EXAM_LABELS[exam]} ${b.highlights.join(" ")} ${b.mentorName ?? ""}`.toLowerCase(),
    purchased: purchasedKeys.has(`mentorship:${b.id}`),
  };
}

const TRACK_FILTERS: TrackFilter[] = ["All", "Dropper", "11th", "12th"];
const EXAM_FILTERS: ExamFilter[] = ["All", "neet", "jee", "cuet", "ipmat"];

// "sessions" moved to the #2 slot (right after the personalized "For you"
// tab, or first if the student has no track set yet) — it was previously
// last, after four other tabs, which buried the platform's clearest
// engagement hook (book a real mentor, often for free) behind everything
// else. The free-sessions banner below covers the "always visible, no
// tab-click required" half of that; this covers "when they do explore
// tabs, it's not the last thing they'd ever find."
type MainTab = "forYou" | "sessions" | "series" | "mentorship" | "tests" | "mentors";

type View = "home" | "explore" | "sessions" | "tests" | "mentors";

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

type BatchPerf = { bundleId: string; bundleTitle: string; testsAttempted: number; totalAttempts: number; averagePercent: number; bestPercent: number };

const slotDate = (r: BookingRow) => new Date(`${r.session_date}T${r.start_time}:00`);

function untilLabel(d: Date) {
  const h = Math.round((d.getTime() - Date.now()) / 36e5);
  if (h < 1) return "Starting soon";
  if (h < 24) return `In ${h} hour${h === 1 ? "" : "s"}`;
  const days = Math.round(h / 24);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [batches, setBatches] = useState<MentorshipBatch[] | null>(null);
  const [mentors, setMentors] = useState<MentorDirectoryEntry[] | null>(null);
  const [soldTests, setSoldTests] = useState<SoldTestEntry[] | null>(null);
  const [purchasedKeys, setPurchasedKeys] = useState<Set<string> | null>(null);
  const [sessionOfferings, setSessionOfferings] = useState<PublicMentorOffering[] | null>(null);
  const [sessionSlots, setSessionSlots] = useState<Record<string, OpenSlot[]>>({});
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("All");
  const [examFilter, setExamFilter] = useState<ExamFilter>("All");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<MainTab>("series");
  const didDefaultToForYou = useRef(false);
  const [view, setView] = useState<View>("home");
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [perf, setPerf] = useState<BatchPerf[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      listMyBookedSessions({ data: { token } }).then((r: { bookings: unknown }) => setBookings(r.bookings as BookingRow[])).catch(() => setBookings([]));
      getMyBatchPerformance({ data: { token } }).then((r: { batches: unknown }) => setPerf(r.batches as BatchPerf[])).catch(() => setPerf([]));
    })();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

  async function loadSessions() {
    if (!user) return;
    const token = await user.getIdToken();
    const { offerings, slotsByOffering } = await listOpenMentorSessions({ data: { token } });
    setSessionOfferings(offerings as PublicMentorOffering[]);
    setSessionSlots(slotsByOffering as Record<string, OpenSlot[]>);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const [
        { profile: p },
        { bundles: bundleRows },
        { batches: batchRows },
        { mentors: mentorRows },
        { tests: soldTestRows },
        { purchases },
        { offerings: sessionRows, slotsByOffering },
      ] = await Promise.all([
        getProfile({ data: { token } }),
        listPublicBundles({ data: { token } }),
        listPublicMentorshipBatches({ data: { token } }),
        listPublicMentors({ data: { token } }),
        listPublicSoldTests({ data: { token } }),
        getMyPurchases({ data: { token } }),
        listOpenMentorSessions({ data: { token } }),
      ]);
      if (p) {
        setProfile({
          fullName: p.fullName,
          targetExam: p.targetExam || "",
          track: (p.track as Track) || "",
        });
      }
      setBundles(bundleRows as Bundle[]);
      setBatches(batchRows as MentorshipBatch[]);
      setMentors(mentorRows as MentorDirectoryEntry[]);
      const purchasedSet = new Set(purchases.map((pu) => `${pu.itemType}:${pu.itemId}`));
      setPurchasedKeys(purchasedSet);
      setSoldTests((soldTestRows as Omit<SoldTestEntry, "purchased" | "searchText">[]).map((t) => soldTestToEntry(t, purchasedSet)));
      setSessionOfferings(sessionRows as PublicMentorOffering[]);
      setSessionSlots(slotsByOffering as Record<string, OpenSlot[]>);
    })();
  }, [user]);

  const allListings = useMemo(() => {
    if (!bundles || !batches || !purchasedKeys) return null;
    return [
      ...bundles.map((b) => bundleToListing(b, purchasedKeys)),
      ...batches.map((b) => batchToListing(b, purchasedKeys)),
    ];
  }, [bundles, batches, purchasedKeys]);

  const track = profile?.track ?? "";
  const examKey = profile?.targetExam ? resolveExamKey(profile.targetExam) : null;
  const firstName = profile?.fullName?.split(" ")[0] || user?.displayName?.split(" ")[0] || "";
  const ownedCount = purchasedKeys?.size ?? 0;

  useEffect(() => {
    if (track && !didDefaultToForYou.current) {
      setTab("forYou");
      didDefaultToForYou.current = true;
    }
  }, [track]);

  // A listing's track can be "11th", "12th", "Dropper", or "All" (an admin
  // choice meaning open to every track) — "All" must match everyone, not
  // just students who literally have "All" as their own track.
  const matchesTrack = (listingTrack: string, wanted: string) => wanted === "All" || listingTrack === wanted || listingTrack === "All";

  const recommended = useMemo(() => {
    if (!allListings || !track) return [];
    return allListings.filter((l) => matchesTrack(l.track, track) && (!examKey || l.exam === examKey));
  }, [allListings, track, examKey]);

  const seriesListings = useMemo(() => {
    if (!allListings) return [];
    return allListings.filter(
      (l) => l.kind === "Test Series" && matchesTrack(l.track, trackFilter) && (examFilter === "All" || l.exam === examFilter),
    );
  }, [allListings, trackFilter, examFilter]);

  const mentorshipListings = useMemo(() => {
    if (!allListings) return [];
    return allListings.filter(
      (l) => l.kind === "Mentorship" && matchesTrack(l.track, trackFilter) && (examFilter === "All" || l.exam === examFilter),
    );
  }, [allListings, trackFilter, examFilter]);

  // The Tests view's "For you" shelf: test-series bundles (not mentorships)
  // that fit the student's track/exam, same "All" rule as above. Falls back
  // to exam-only matching when the student hasn't set a track yet.
  const testSeriesForYou = useMemo(() => {
    if (!allListings) return [];
    return allListings.filter(
      (l) => l.kind === "Test Series" && (!track || matchesTrack(l.track, track)) && (!examKey || l.exam === examKey),
    );
  }, [allListings, track, examKey]);

  // Nearest 1-2 open slots per free offering, flattened and sorted by
  // soonest first — what the always-visible banner actually shows. Capped
  // at 6 cards so the strip stays scannable rather than becoming its own
  // wall of content.
  const featuredFreeSlots = useMemo(() => {
    if (!sessionOfferings) return [];
    const out: { offering: PublicMentorOffering; slot: OpenSlot }[] = [];
    for (const o of sessionOfferings) {
      if (!o.isFree) continue;
      const slots = sessionSlots[o.id] ?? [];
      if (slots.length === 0) continue;
      out.push({ offering: o, slot: slots[0] });
    }
    return out.sort((a, b) => (a.slot.date + a.slot.startTime).localeCompare(b.slot.date + b.slot.startTime)).slice(0, 6);
  }, [sessionOfferings, sessionSlots]);

  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  const matchedMentors = useMemo(() => {
    if (!mentors || !q) return [];
    return mentors.filter((m) => m.searchText.includes(q)).slice(0, 5);
  }, [mentors, q]);

  const matchedListings = useMemo(() => {
    if (!allListings || !q) return [];
    return allListings.filter((l) => l.searchText.includes(q)).slice(0, 8);
  }, [allListings, q]);

  const matchedTests = useMemo(() => {
    if (!soldTests || !q) return [];
    return soldTests.filter((t) => t.searchText.includes(q)).slice(0, 5);
  }, [soldTests, q]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const freeSessionCount = featuredFreeSlots.length;
  const ownedListings = (allListings ?? []).filter((l) => l.purchased);
  const ownedTests = (soldTests ?? []).filter((t) => t.purchased);
  const now = new Date();
  const upcoming = (bookings ?? []).filter((r) => r.status === "upcoming" && slotDate(r) >= now).sort((a, b) => slotDate(a).getTime() - slotDate(b).getTime());
  const attempts = perf?.reduce((n, b) => n + b.totalAttempts, 0) ?? 0;
  const avg = perf && attempts > 0 ? Math.round(perf.reduce((s, b) => s + b.averagePercent * b.totalAttempts, 0) / attempts) : null;
  const best = perf && attempts > 0 ? Math.max(...perf.map((b) => b.bestPercent)) : null;
  const testsDone = perf?.reduce((n, b) => n + b.testsAttempted, 0) ?? 0;
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const nav: { key: View; label: string; icon: typeof Home; badge?: number }[] = [
    { key: "home", label: "Overview", icon: Home },
    { key: "explore", label: "Explore", icon: Compass },
    { key: "sessions", label: "Sessions", icon: CalendarDays, badge: freeSessionCount || undefined },
    { key: "tests", label: "Tests", icon: ClipboardList },
    { key: "mentors", label: "Mentors", icon: Users2 },
  ];
  const title = view === "home" ? (firstName ? `${greet}, ${firstName}` : greet) : nav.find((n) => n.key === view)!.label;
  const showFilters = view === "explore" && (tab === "series" || tab === "mentorship");
  const exploreTabs = [...(track ? [["forYou", "For you"] as const] : []), ["series", "Test series"] as const, ["mentorship", "Mentorships"] as const];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader user={user} displayName={profile?.fullName} />

      <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
        {/* ── Sidebar (desktop) ─────────────────────────────── */}
        <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-56 shrink-0 flex-col justify-between py-8 md:flex">
          <nav className="space-y-1">
            {nav.map((n) => (
              <button key={n.key} type="button" onClick={() => { setView(n.key); setQuery(""); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${view === n.key ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-secondary"}`}>
                <n.icon className="h-[18px] w-[18px]" />{n.label}
                {n.badge != null && <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{n.badge}</span>}
              </button>
            ))}
          </nav>
          <nav className="space-y-1 border-t border-border pt-4">
            {([["/my-sessions", "My bookings", CalendarDays], ["/purchases", "Purchases", Receipt], ["/tickets", "Support", LifeBuoy], ["/profile", "Profile", GraduationCap]] as const).map(([to, label, Icon]) => (
              <Link key={to} to={to} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><Icon className="h-4 w-4" />{label}</Link>
            ))}
          </nav>
        </aside>

        {/* ── Main ──────────────────────────────────────────── */}
        <main className="min-w-0 flex-1 pb-28 pt-6 md:pb-12 md:pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {view === "home" && <p className="text-sm font-semibold text-muted-foreground">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>}
              <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{title}</h1>
            </div>
            <label className="flex min-h-12 w-full items-center gap-3 rounded-full border border-border bg-card px-4 transition-colors focus-within:border-primary sm:max-w-xs">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mentors, courses, tests…" className="w-full bg-transparent text-[15px] placeholder:text-muted-foreground focus:outline-none" />
              {hasQuery && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>}
            </label>
          </div>

          <div className="mt-6">
            {hasQuery ? (
              <SearchResults query={query} matchedMentors={matchedMentors} matchedListings={matchedListings} matchedTests={matchedTests} loading={mentors === null || allListings === null || soldTests === null} />
            ) : view === "home" ? (
              <Overview
                upcoming={upcoming} bookingsLoaded={bookings !== null} perf={perf} avg={avg} best={best} testsDone={testsDone} attempts={attempts}
                ownedListings={ownedListings} ownedTests={ownedTests} freeSlots={featuredFreeSlots}
                recommended={(track ? recommended : (allListings ?? []).filter((l) => l.kind === "Test Series")).slice(0, 3)}
                go={setView} getToken={() => user.getIdToken()} onBooked={loadSessions}
              />
            ) : view === "explore" ? (
              <>
                <div className="inline-flex rounded-full border border-border p-1">
                  {exploreTabs.map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)} className={`min-h-10 rounded-full px-4 text-sm font-bold transition-colors ${tab === k ? "bg-foreground text-background" : "text-foreground/70"}`}>{label}</button>
                  ))}
                </div>
                {showFilters && (
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">{EXAM_FILTERS.map((e) => <FilterChip key={e} active={examFilter === e} onClick={() => setExamFilter(e)}>{e === "All" ? "All exams" : EXAM_LABELS[e]}</FilterChip>)}</div>
                    <div className="flex flex-wrap gap-2">{TRACK_FILTERS.map((t) => <FilterChip key={t} active={trackFilter === t} onClick={() => setTrackFilter(t)}>{t === "All" ? "All tracks" : t}</FilterChip>)}</div>
                  </div>
                )}
                <div className="mt-6">
                  {tab === "forYou" && <ListingGrid listings={recommended} loading={allListings === null} emptyText={`Nothing published for ${track}${examKey ? ` · ${EXAM_LABELS[examKey]}` : ""} yet.`} showKindBadge />}
                  {tab === "series" && <ListingGrid listings={seriesListings} loading={allListings === null} emptyText="No test series match this filter." />}
                  {tab === "mentorship" && <ListingGrid listings={mentorshipListings} loading={allListings === null} emptyText="No mentorships match this filter." />}
                </div>
              </>
            ) : view === "sessions" ? (
              <div>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Free and paid sessions open for booking right now.</p>
                  <Link to="/my-sessions" className={linkAction}>My booked sessions</Link>
                </div>
                <StudentOpenSessionsModule getToken={() => user.getIdToken()} />
              </div>
            ) : view === "tests" ? (
              <div className="space-y-10">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="font-display text-xl font-extrabold tracking-tight">Test series</h2>
                    <button type="button" onClick={() => { setView("explore"); setTab("series"); }} className={linkAction}>Browse all</button>
                  </div>
                  <ListingGrid
                    listings={testSeriesForYou}
                    loading={allListings === null}
                    emptyText={`No test series published for ${track || "your track"}${examKey ? ` · ${EXAM_LABELS[examKey]}` : ""} yet.`}
                    showKindBadge
                  />
                </div>
                <div>
                  <h2 className="mb-4 font-display text-xl font-extrabold tracking-tight">Individual tests</h2>
                  <SoldTestGrid tests={soldTests} />
                </div>
              </div>
            ) : (
              <MentorGrid mentors={mentors} />
            )}
          </div>
        </main>
      </div>

      {/* ── Bottom tab bar (phones) ─────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {nav.map((n) => (
          <button key={n.key} type="button" onClick={() => { setView(n.key); setQuery(""); window.scrollTo({ top: 0 }); }} aria-current={view === n.key} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${view === n.key ? "text-primary" : "text-muted-foreground"}`}>
            {view === n.key && <motion.span layoutId="bottom-tab" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />}
            <span className="relative"><n.icon className="h-5 w-5" />{n.badge != null && <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">{n.badge}</span>}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Overview (the actual dashboard) ────────────────────────────────────
function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-extrabold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const linkAction = "inline-flex min-h-9 items-center text-sm font-bold text-primary hover:underline";

function Overview({ upcoming, bookingsLoaded, perf, avg, best, testsDone, attempts, ownedListings, ownedTests, freeSlots, recommended, go, getToken, onBooked }: {
  upcoming: BookingRow[]; bookingsLoaded: boolean; perf: BatchPerf[] | null; avg: number | null; best: number | null; testsDone: number; attempts: number;
  ownedListings: Listing[]; ownedTests: SoldTestEntry[]; freeSlots: { offering: PublicMentorOffering; slot: OpenSlot }[]; recommended: Listing[];
  go: (v: View) => void; getToken: () => Promise<string>; onBooked: () => void;
}) {
  const navigate = useNavigate();
  const next = upcoming[0];
  const continueCount = ownedListings.length + ownedTests.length;
  const actions = [
    { icon: Play, label: "Take a free mock", sub: "Exam-format practice", to: "/simulator/live" },
    { icon: Users2, label: "Find a mentor", sub: "Who cleared your exam", onClick: () => go("mentors") },
    { icon: Compass, label: "Explore courses", sub: "Series and mentorships", onClick: () => go("explore") },
    { icon: LifeBuoy, label: "Get support", sub: "Raise a ticket", to: "/tickets" },
  ];
  const tile = "group flex min-h-24 min-w-0 flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary sm:min-h-20 sm:flex-row sm:items-center";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Up next */}
        <section className="ink-section flex min-w-0 flex-col justify-between rounded-3xl p-6 lg:col-span-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7ba4f0]">Up next</p>
          {next ? (
            <>
              <div className="mt-4">
                <p className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{slotDate(next).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
                <p className="mt-1 text-white/70">{next.start_time} · {next.duration_minutes} min · {untilLabel(slotDate(next))}</p>
                <p className="mt-3 truncate font-display text-lg font-bold">{next.mentor_session_offerings?.title ?? "Mentor session"}</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {next.meeting_link && <a href={next.meeting_link} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#ffffff] px-5 text-sm font-bold text-[#141b2b]"><LinkIcon className="h-4 w-4" />Join session</a>}
                <Link to="/my-sessions" className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white hover:border-white/60">{upcoming.length > 1 ? `All ${upcoming.length} sessions` : "My sessions"}</Link>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4">
                <p className="font-display text-3xl font-extrabold tracking-tight">{bookingsLoaded ? "Nothing booked yet" : "Checking your calendar…"}</p>
                <p className="mt-2 max-w-sm text-white/65">{freeSlots.length > 0 ? `${freeSlots.length} free mentor session${freeSlots.length === 1 ? " is" : "s are"} open right now.` : "Book a session with a mentor who has cleared your exam."}</p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => go("sessions")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#ffffff] px-5 text-sm font-bold text-[#141b2b]">Browse sessions <ArrowRight className="h-4 w-4" /></button>
                <Link to="/my-sessions" className="inline-flex min-h-11 items-center text-sm font-semibold text-white/70 hover:text-white">My sessions</Link>
              </div>
            </>
          )}
        </section>

        {/* Performance */}
        <Panel title="Your performance" className="lg:col-span-2">
          {perf === null ? (
            <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
          ) : avg === null ? (
            <div>
              <p className="text-sm text-muted-foreground">No scored attempts in your courses yet. Take a test to see your average and where marks leak.</p>
              <Link to="/simulator/live" className="clay-btn mt-4 inline-flex min-h-11 items-center gap-2 px-5 text-sm">Take a free mock <ArrowRight className="h-4 w-4" /></Link>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-6">
                <div><p className="font-display text-5xl font-extrabold leading-none tracking-tight">{avg}<span className="text-2xl font-semibold text-muted-foreground">%</span></p><p className="mt-1 text-xs font-semibold text-muted-foreground">average score</p></div>
                <div className="pb-0.5 text-xs text-muted-foreground"><p><b className="text-foreground">{best}%</b> best</p><p><b className="text-foreground">{testsDone}</b> tests · <b className="text-foreground">{attempts}</b> attempts</p></div>
              </div>
              <ul className="mt-5 space-y-3">
                {perf.filter((b) => b.totalAttempts > 0).slice(0, 4).map((b) => (
                  <li key={b.bundleId}>
                    <div className="mb-1 flex justify-between gap-3 text-xs font-semibold"><span className="truncate">{b.bundleTitle}</span><span className="shrink-0 text-muted-foreground">{b.averagePercent}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${b.averagePercent}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} /></div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((a) => {
          const inner = (<><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><a.icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-sm font-bold leading-tight">{a.label}</p><p className="mt-0.5 text-xs leading-snug text-muted-foreground">{a.sub}</p></div></>);
          return a.to ? <Link key={a.label} to={a.to} className={tile}>{inner}</Link> : <button key={a.label} type="button" onClick={a.onClick} className={tile}>{inner}</button>;
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel title="Continue learning" className="lg:col-span-3" action={continueCount > 0 ? <Link to="/purchases" className={linkAction}>All purchases</Link> : undefined}>
          {continueCount === 0 ? (
            <div className="text-sm text-muted-foreground">You haven't enrolled in anything yet. <button type="button" onClick={() => go("explore")} className="font-bold text-primary hover:underline">Explore courses</button></div>
          ) : (
            <div className="-mx-2">
              {ownedListings.slice(0, 4).map((l) => (
                <ResultRow key={`${l.kind}-${l.id}`} onClick={() => navigate({ to: "/course/$kind/$id", params: { kind: l.kind === "Test Series" ? "bundle" : "mentorship", id: l.id } })}
                  icon={l.thumbnailUrl ? <img src={l.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : l.kind === "Test Series" ? <BookOpen className="h-4 w-4" /> : <Users2 className="h-4 w-4" />}
                  title={l.title} sub={`${EXAM_LABELS[l.exam]} · ${l.kind}`} />
              ))}
              {ownedTests.slice(0, 3).map((t) => (
                <ResultRow key={t.id} onClick={() => navigate({ to: "/sold-test/$id", params: { id: t.id } })} icon={<Tag className="h-4 w-4" />} title={t.name} sub={`By ${t.mentorName} · ${t.totalQuestions}Q`} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Free sessions open" className="lg:col-span-2" action={freeSlots.length > 0 ? <button type="button" onClick={() => go("sessions")} className={linkAction}>See all</button> : undefined}>
          {freeSlots.length === 0 ? <p className="text-sm text-muted-foreground">No free sessions are open right now. Check back soon.</p> : <FreeSlotList slots={freeSlots} getToken={getToken} onBooked={onBooked} />}
        </Panel>
      </div>

      {recommended.length > 0 && (
        <section className="pt-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-extrabold tracking-tight">Recommended for you</h2><button type="button" onClick={() => go("explore")} className={linkAction}>Explore all</button></div>
          <div className={GRID}>{recommended.map((l, i) => <ListingCard key={`${l.kind}-${l.id}`} listing={l} index={i} />)}</div>
        </section>
      )}
    </div>
  );
}

function FreeSlotList({ slots, getToken, onBooked }: { slots: { offering: PublicMentorOffering; slot: OpenSlot }[]; getToken: () => Promise<string>; onBooked: () => void }) {
  const [booking, setBooking] = useState<{ offering: PublicMentorOffering; slot: OpenSlot } | null>(null);
  return (
    <>
      <ul className="-mx-2">
        {slots.slice(0, 4).map(({ offering, slot }) => (
          <li key={offering.id}>
            <button type="button" onClick={() => setBooking({ offering, slot })} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-secondary">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Gift className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{offering.title}</p>
                <p className="truncate text-xs text-muted-foreground">{offering.mentorName} · {new Date(slot.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {slot.startTime}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Book</span>
            </button>
          </li>
        ))}
      </ul>
      {booking && <BookingDialog offering={booking.offering} slot={booking.slot} getToken={getToken} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); onBooked(); }} />}
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center rounded-full border px-4 text-xs font-bold transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border text-foreground/70 hover:border-foreground/40"}`}
    >
      {children}
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-secondary" />)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

const CARD = "clay group flex flex-col overflow-hidden text-left hover:border-primary";
const CTA = "mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-all group-hover:gap-3";
const OWNED = "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400";

function fadeUp(i: number) {
  return { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] as const } };
}

// ─── Search ─────────────────────────────────────────────────────────────
function ResultRow({ onClick, icon, title, sub, right }: { onClick: () => void; icon: ReactNode; title: string; sub: string; right?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-secondary">
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      {right}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SearchResults({ matchedMentors, matchedListings, matchedTests, loading, query }: { query: string; matchedMentors: MentorDirectoryEntry[]; matchedListings: Listing[]; matchedTests: SoldTestEntry[]; loading: boolean }) {
  const navigate = useNavigate();
  const has = matchedMentors.length > 0 || matchedListings.length > 0 || matchedTests.length > 0;
  const Label = ({ children }: { children: ReactNode }) => <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</p>;
  const owned = <span className={OWNED}>Owned</span>;
  return (
    <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-3xl border border-border bg-card p-2">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !has ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for "{query}".</p>
      ) : (
        <div className="space-y-4 py-2">
          {matchedMentors.length > 0 && (
            <div><Label>Mentors</Label>
              {matchedMentors.map((m) => (
                <ResultRow key={m.id} onClick={() => navigate({ to: "/mentor-profile/$mentorId", params: { mentorId: m.id } })}
                  icon={m.profilePictureUrl ? <img src={m.profilePictureUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-bold">{m.name.charAt(0)}</span>}
                  title={m.name} sub={[m.yearOfStudy, m.avgRating !== null ? `★ ${m.avgRating}` : ""].filter(Boolean).join(" · ") || "Mentor"} />
              ))}
            </div>
          )}
          {matchedListings.length > 0 && (
            <div><Label>Courses</Label>
              {matchedListings.map((l) => (
                <ResultRow key={`${l.kind}-${l.id}`} onClick={() => navigate({ to: "/course/$kind/$id", params: { kind: l.kind === "Test Series" ? "bundle" : "mentorship", id: l.id } })}
                  icon={l.thumbnailUrl ? <img src={l.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : l.kind === "Test Series" ? <BookOpen className="h-4 w-4" /> : <Users2 className="h-4 w-4" />}
                  title={l.title} sub={`${EXAM_LABELS[l.exam]} · ${l.kind} · ${l.track || "All tracks"}`} right={l.purchased ? owned : undefined} />
              ))}
            </div>
          )}
          {matchedTests.length > 0 && (
            <div><Label>Individual tests</Label>
              {matchedTests.map((t) => (
                <ResultRow key={t.id} onClick={() => navigate({ to: "/sold-test/$id", params: { id: t.id } })} icon={<Tag className="h-4 w-4" />}
                  title={t.name} sub={`By ${t.mentorName}`} right={t.purchased ? owned : <span className="shrink-0 text-xs font-bold">₹{t.price}</span>} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grids ──────────────────────────────────────────────────────────────
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

function ListingGrid({ listings, loading, emptyText, showKindBadge }: { listings: Listing[]; loading: boolean; emptyText: string; showKindBadge?: boolean }) {
  if (loading) return <SkeletonGrid />;
  if (listings.length === 0) return <Empty text={emptyText} />;
  return <div className={GRID}>{listings.map((l, i) => <ListingCard key={`${l.kind}-${l.id}`} listing={l} index={i} showKindBadge={showKindBadge} />)}</div>;
}

function SoldTestGrid({ tests }: { tests: SoldTestEntry[] | null }) {
  if (tests === null) return <SkeletonGrid />;
  if (tests.length === 0) return <Empty text="No individual tests available yet." />;
  return <div className={GRID}>{tests.map((t, i) => <SoldTestCard key={t.id} test={t} index={i} />)}</div>;
}

function MentorGrid({ mentors }: { mentors: MentorDirectoryEntry[] | null }) {
  if (mentors === null) return <SkeletonGrid />;
  if (mentors.length === 0) return <Empty text="No mentors listed yet." />;
  return <div className={GRID}>{mentors.map((m, i) => <MentorCard key={m.id} mentor={m} index={i} />)}</div>;
}

// ─── Cards (the whole card is one tap target) ───────────────────────────
function ListingCard({ listing, index = 0, showKindBadge }: { listing: Listing; index?: number; showKindBadge?: boolean }) {
  const navigate = useNavigate();
  const MetaIcon = listing.metaIcon;
  const Icon = listing.kind === "Test Series" ? BookOpen : Users2;
  return (
    <motion.button {...fadeUp(index)} type="button" className={`${CARD} h-full`} onClick={() => navigate({ to: "/course/$kind/$id", params: { kind: listing.kind === "Test Series" ? "bundle" : "mentorship", id: listing.id } })}>
      <div className="relative grid aspect-[16/9] w-full place-items-center overflow-hidden bg-secondary">
        {listing.thumbnailUrl ? <img src={listing.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon className="h-10 w-10 text-primary/40" strokeWidth={1.4} />}
        <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-foreground">{EXAM_LABELS[listing.exam]}</span>
        {showKindBadge && <span className="absolute right-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-bold text-background">{listing.kind}</span>}
      </div>
      <div className="flex w-full flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-display text-lg font-bold leading-snug tracking-tight text-foreground">{listing.title}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MetaIcon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{listing.metaLine}</span><span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 font-bold">{listing.track || "All"}</span></p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
          {listing.purchased ? (
            <span className={OWNED}><BadgeCheck className="h-3.5 w-3.5" />You're in</span>
          ) : listing.sellingPrice === 0 ? (
            <span className="font-display text-xl font-extrabold text-primary">Free</span>
          ) : (
            <>
              <span className="font-display text-xl font-extrabold text-foreground">₹{listing.sellingPrice.toLocaleString()}</span>
              {listing.crossedPrice > listing.sellingPrice && <span className="text-sm text-muted-foreground line-through">₹{listing.crossedPrice.toLocaleString()}</span>}
              {listing.discountPercent > 0 && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{listing.discountPercent}% off</span>}
            </>
          )}
        </div>
        <span className={CTA}>{listing.purchased ? "Study now" : listing.sellingPrice === 0 ? "Get for free" : "Buy now"}<ArrowRight className="h-4 w-4" /></span>
      </div>
    </motion.button>
  );
}

function SoldTestCard({ test, index = 0 }: { test: SoldTestEntry; index?: number }) {
  const navigate = useNavigate();
  return (
    <motion.button {...fadeUp(index)} type="button" className={`${CARD} h-full`} onClick={() => navigate({ to: "/sold-test/$id", params: { id: test.id } })}>
      <div className="grid aspect-[16/9] w-full place-items-center bg-secondary"><ClipboardList className="h-10 w-10 text-primary/40" strokeWidth={1.4} /></div>
      <div className="flex w-full flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-display text-lg font-bold leading-snug tracking-tight text-foreground">{test.name}</h3>
        <p className="mt-2 truncate text-xs text-muted-foreground">By {test.mentorName} · {test.totalQuestions}Q · {test.durationMinutes}m</p>
        <div className="mt-4">{test.purchased ? <span className={OWNED}><BadgeCheck className="h-3.5 w-3.5" />You're in</span> : <span className="font-display text-xl font-extrabold">₹{test.price.toLocaleString()}</span>}</div>
        <span className={CTA}>{test.purchased ? "Start test" : "Buy now"}<ArrowRight className="h-4 w-4" /></span>
      </div>
    </motion.button>
  );
}

function MentorCard({ mentor, index = 0 }: { mentor: MentorDirectoryEntry; index?: number }) {
  return (
    <motion.div {...fadeUp(index)} className="h-full">
      <Link to="/mentor-profile/$mentorId" params={{ mentorId: mentor.id }} className={`${CARD} h-full p-5`}>
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 font-display text-lg font-bold text-primary">
            {mentor.profilePictureUrl ? <img src={mentor.profilePictureUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : mentor.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-display text-base font-bold text-foreground">{mentor.name}<BadgeCheck className="h-4 w-4 shrink-0 text-primary" /></p>
            {mentor.yearOfStudy && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><GraduationCap className="h-3 w-3 shrink-0" />{mentor.yearOfStudy}</p>}
          </div>
          {mentor.avgRating !== null && <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-bold"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />{mentor.avgRating}</span>}
        </div>
        {mentor.aboutText && <p className="mt-4 line-clamp-2 text-sm text-muted-foreground">{mentor.aboutText}</p>}
        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="text-xs font-bold text-muted-foreground">{mentor.batches.length} batch{mentor.batches.length === 1 ? "" : "es"}</span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-primary transition-all group-hover:gap-2">View profile<ChevronRight className="h-4 w-4" /></span>
        </div>
      </Link>
    </motion.div>
  );
}