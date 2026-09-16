import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconLoader2 as Loader2, IconSearch as Search, IconBook2 as BookOpen, IconUsersGroup as Users2, IconArrowRight as ArrowRight, IconChevronRight as ChevronRight, IconSchool as GraduationCap, IconStar as Star, IconRosetteDiscountCheck as BadgeCheck, IconTag as Tag, IconClipboardList as ClipboardList, IconX as X, IconSparkles as Sparkles } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/server-functions/profile";
import { listPublicBundles, listPublicMentorshipBatches, listPublicMentors, listPublicSoldTests } from "@/server-functions/catalog";
import { getMyPurchases } from "@/server-functions/student-data";
import { StudentOpenSessionsModule } from "@/components/student-open-sessions-module";
import { AppHeader } from "@/components/app-header";

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

// Each exam gets its own color so the same badge is recognizable at a
// glance across every card, search row, and filter chip. Fallback hex
// values are baked in so this renders correctly even before your global
// CSS defines the --pink/--amber/--purple/--teal-deep variables — once
// you do add them (see notes at the end), these just pick them up.
const EXAM_COLORS: Record<ExamKey, { soft: string; deep: string }> = {
  neet: { soft: "var(--teal-soft, #E1F5EE)", deep: "var(--teal-deep, #0F6E56)" },
  jee: { soft: "var(--sky-soft)", deep: "var(--sky-deep)" },
  cuet: { soft: "var(--amber-soft, #FEF3C7)", deep: "var(--amber-deep, #B45309)" },
  ipmat: { soft: "var(--pink-soft, #FCE7F3)", deep: "var(--pink-deep, #BE185D)" },
};

const KIND_COLORS: Record<"Test Series" | "Mentorship", { soft: string; deep: string }> = {
  "Test Series": { soft: "var(--teal-soft, #E1F5EE)", deep: "var(--teal-deep, #0F6E56)" },
  Mentorship: { soft: "var(--pink-soft, #FCE7F3)", deep: "var(--pink-deep, #BE185D)" },
};

const PURPLE_SOFT = "var(--purple-soft, #EDE9FE)";
const PURPLE_DEEP = "var(--purple-deep, #6D28D9)";
const AMBER_SOFT = "var(--amber-soft, #FEF3C7)";
const AMBER_DEEP = "var(--amber-deep, #B45309)";

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

// Standalone Sold Tests — deliberately NOT folded into the Listing type
// below. Listing assumes every entry has a Track and an ExamKey for
// filtering/recommending, and Sold Tests have neither. They get their
// own type and their own tab.
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

type MainTab = "forYou" | "series" | "mentorship" | "tests" | "mentors" | "sessions";

function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [batches, setBatches] = useState<MentorshipBatch[] | null>(null);
  const [mentors, setMentors] = useState<MentorDirectoryEntry[] | null>(null);
  const [soldTests, setSoldTests] = useState<SoldTestEntry[] | null>(null);
  const [purchasedKeys, setPurchasedKeys] = useState<Set<string> | null>(null);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("All");
  const [examFilter, setExamFilter] = useState<ExamFilter>("All");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<MainTab>("series");
  const didDefaultToForYou = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

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
      ] = await Promise.all([
        getProfile({ data: { token } }),
        listPublicBundles({ data: { token } }),
        listPublicMentorshipBatches({ data: { token } }),
        listPublicMentors({ data: { token } }),
        listPublicSoldTests({ data: { token } }),
        getMyPurchases({ data: { token } }),
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

  // Land the student on "For You" the first time we learn their track,
  // without yanking them back there if they've already picked a tab.
  useEffect(() => {
    if (track && !didDefaultToForYou.current) {
      setTab("forYou");
      didDefaultToForYou.current = true;
    }
  }, [track]);

  const recommended = useMemo(() => {
    if (!allListings || !track) return [];
    return allListings.filter((l) => l.track === track && (!examKey || l.exam === examKey));
  }, [allListings, track, examKey]);

  const seriesListings = useMemo(() => {
    if (!allListings) return [];
    return allListings.filter(
      (l) => l.kind === "Test Series" && (trackFilter === "All" || l.track === trackFilter) && (examFilter === "All" || l.exam === examFilter),
    );
  }, [allListings, trackFilter, examFilter]);

  const mentorshipListings = useMemo(() => {
    if (!allListings) return [];
    return allListings.filter(
      (l) => l.kind === "Mentorship" && (trackFilter === "All" || l.track === trackFilter) && (examFilter === "All" || l.exam === examFilter),
    );
  }, [allListings, trackFilter, examFilter]);

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

  const tabs: { key: MainTab; label: string; color?: string }[] = [
    ...(track ? [{ key: "forYou" as const, label: "For you" }] : []),
    { key: "series", label: "Test series", color: KIND_COLORS["Test Series"].deep },
    { key: "mentorship", label: "Mentorships", color: KIND_COLORS["Mentorship"].deep },
    { key: "tests", label: "Tests", color: AMBER_DEEP },
    { key: "mentors", label: "Mentors", color: PURPLE_DEEP },
    { key: "sessions", label: "Book a session" },
  ];

  const showFilters = tab === "series" || tab === "mentorship";


  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-70 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-70 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} displayName={profile?.fullName} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Warm greeting strip — real numbers only, no invented streaks */}
        <div className="clay mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[var(--teal-deep)]">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Keep it going</span>
            </div>
            <h1 className="truncate font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {firstName ? `Hey ${firstName}` : "Welcome back"}
            </h1>
            {ownedCount > 0 && (
              <p className="mt-1 text-sm text-foreground/60">
                You're enrolled in {ownedCount} {ownedCount === 1 ? "course" : "courses"} right now.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {profile?.targetExam && (
              <span
                className={
                  examKey
                    ? "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                    : "clay-inset flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-foreground"
                }
                style={
                  examKey
                    ? { background: EXAM_COLORS[examKey].soft, color: EXAM_COLORS[examKey].deep }
                    : undefined
                }
              >
                {examKey ? EXAM_LABELS[examKey] : profile.targetExam}
              </span>
            )}
            {track && (
              <span className="clay-inset flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-foreground">
                {track}
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="clay-inset flex items-center gap-3 rounded-2xl px-5 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-foreground/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mentors, courses, tests…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
          />
          {hasQuery && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0 text-foreground/40 hover:text-foreground/70">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {hasQuery ? (
          <SearchResults
            query={query}
            matchedMentors={matchedMentors}
            matchedListings={matchedListings}
            matchedTests={matchedTests}
            loading={mentors === null || allListings === null || soldTests === null}
          />
        ) : (
          <>
            {/* Tab bar — horizontal scroll instead of wrap, each tab tinted to its category color */}
            <div className="mt-6 flex gap-1.5 overflow-x-auto border-b border-foreground/10 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={
                      active
                        ? "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold text-white transition-all duration-200"
                        : "clay-chip shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold text-foreground/70 transition-all duration-200"
                    }
                    style={active ? { background: t.color ?? "var(--sky-deep)" } : undefined}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {showFilters && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {EXAM_FILTERS.map((e) => {
                    const active = examFilter === e;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setExamFilter(e)}
                        className={active ? "rounded-full px-3 py-1.5 text-[11px] font-bold text-white transition-all duration-200" : "clay-chip rounded-full px-3 py-1.5 text-[11px] font-bold text-foreground/60 transition-all duration-200"}
                        style={active ? { background: e === "All" ? "var(--sky-deep)" : EXAM_COLORS[e].deep } : undefined}
                      >
                        {e === "All" ? "All exams" : EXAM_LABELS[e]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TRACK_FILTERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTrackFilter(t)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-200 ${
                        trackFilter === t ? "clay-btn text-white" : "clay-chip text-foreground/60"
                      }`}
                    >
                      {t === "All" ? "All tracks" : t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              {tab === "forYou" && (
                <ListingGrid
                  listings={recommended}
                  loading={allListings === null}
                  loadedEmptyText={`Nothing published for ${track}${examKey ? ` · ${EXAM_LABELS[examKey]}` : ""} yet.`}
                  showKindBadge
                />
              )}
              {tab === "series" && (
                <ListingGrid listings={seriesListings} loading={allListings === null} loadedEmptyText="No test series match this filter." />
              )}
              {tab === "mentorship" && (
                <ListingGrid listings={mentorshipListings} loading={allListings === null} loadedEmptyText="No mentorships match this filter." />
              )}
              {tab === "tests" && <SoldTestGrid tests={soldTests} />}
              {tab === "mentors" && <MentorGrid mentors={mentors} />}
              {tab === "sessions" && <StudentOpenSessionsModule getToken={() => user.getIdToken()} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SearchResults({
  matchedMentors,
  matchedListings,
  matchedTests,
  loading,
  query,
}: {
  query: string;
  matchedMentors: MentorDirectoryEntry[];
  matchedListings: Listing[];
  matchedTests: SoldTestEntry[];
  loading: boolean;
}) {
  const hasResults = matchedMentors.length > 0 || matchedListings.length > 0 || matchedTests.length > 0;

  return (
    <div className="clay mt-3 max-h-[28rem] overflow-y-auto p-3">
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : !hasResults ? (
        <p className="px-3 py-6 text-center text-sm text-foreground/50">No matches for "{query}".</p>
      ) : (
        <div className="space-y-4">
          {matchedMentors.length > 0 && (
            <div>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: PURPLE_DEEP }}>Mentors</p>
              <div className="space-y-1.5">
                {matchedMentors.map((m) => (
                  <MentorResultRow key={m.id} mentor={m} />
                ))}
              </div>
            </div>
          )}
          {matchedListings.length > 0 && (
            <div>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide text-foreground/40">Courses</p>
              <div className="space-y-1.5">
                {matchedListings.map((l) => (
                  <ListingResultRow key={`${l.kind}-${l.id}`} listing={l} />
                ))}
              </div>
            </div>
          )}
          {matchedTests.length > 0 && (
            <div>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: AMBER_DEEP }}>Individual tests</p>
              <div className="space-y-1.5">
                {matchedTests.map((t) => (
                  <SoldTestResultRow key={t.id} test={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MentorResultRow({ mentor }: { mentor: MentorDirectoryEntry }) {
  return (
    <Link
      to="/mentor-profile/$mentorId"
      params={{ mentorId: mentor.id }}
      className="clay-inset flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 hover:bg-foreground/5"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ background: PURPLE_SOFT }}
      >
        {mentor.profilePictureUrl ? (
          <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-bold" style={{ color: PURPLE_DEEP }}>
            {mentor.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">{mentor.name}</p>
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-white" style={{ fill: PURPLE_DEEP }} />
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground/50">
          {mentor.yearOfStudy && <span className="truncate">{mentor.yearOfStudy}</span>}
          {mentor.avgRating !== null && (
            <span className="flex shrink-0 items-center gap-0.5">
              <Star className="h-3 w-3" style={{ fill: AMBER_DEEP, color: AMBER_DEEP }} />
              {mentor.avgRating}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
    </Link>
  );
}

function ListingResultRow({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const routeKind = listing.kind === "Test Series" ? "bundle" : "mentorship";
  const color = KIND_COLORS[listing.kind];

  function goToDetail() {
    navigate({ to: "/course/$kind/$id", params: { kind: routeKind, id: listing.id } });
  }

  return (
    <button
      onClick={goToDetail}
      className="clay-inset flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-foreground/5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: color.soft }}>
        {listing.thumbnailUrl ? (
          <img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : listing.kind === "Test Series" ? (
          <BookOpen className="h-4 w-4" style={{ color: color.deep }} />
        ) : (
          <Users2 className="h-4 w-4" style={{ color: color.deep }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{listing.title}</p>
        <p className="truncate text-xs text-foreground/50">
          {EXAM_LABELS[listing.exam]} · {listing.kind} · {listing.track || "All tracks"}
        </p>
      </div>
      {listing.purchased && (
        <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold text-foreground">Owned</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
    </button>
  );
}

function SoldTestResultRow({ test }: { test: SoldTestEntry }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate({ to: "/sold-test/$id", params: { id: test.id } })}
      className="clay-inset flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-foreground/5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: AMBER_SOFT }}>
        <Tag className="h-4 w-4" style={{ color: AMBER_DEEP }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{test.name}</p>
        <p className="truncate text-xs text-foreground/50">By {test.mentorName} · Individual test</p>
      </div>
      {test.purchased ? (
        <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold text-foreground">Owned</span>
      ) : (
        <span className="shrink-0 text-xs font-bold text-foreground/70">₹{test.price}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
    </button>
  );
}

function ListingGrid({
  listings,
  loading,
  loadedEmptyText,
  showKindBadge,
}: {
  listings: Listing[];
  loading: boolean;
  loadedEmptyText: string;
  showKindBadge?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (listings.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">{loadedEmptyText}</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <ListingCard key={`${l.kind}-${l.id}`} listing={l} showKindBadge={showKindBadge} />
      ))}
    </div>
  );
}

function SoldTestGrid({ tests }: { tests: SoldTestEntry[] | null }) {
  if (tests === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (tests.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No individual tests available yet.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {tests.map((t) => (
        <SoldTestCard key={t.id} test={t} />
      ))}
    </div>
  );
}

function MentorGrid({ mentors }: { mentors: MentorDirectoryEntry[] | null }) {
  if (mentors === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (mentors.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No mentors listed yet.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {mentors.map((m) => (
        <MentorCard key={m.id} mentor={m} />
      ))}
    </div>
  );
}

function ListingCard({ listing, showKindBadge }: { listing: Listing; showKindBadge?: boolean }) {
  const navigate = useNavigate();
  const routeKind = listing.kind === "Test Series" ? "bundle" : "mentorship";
  const MetaIcon = listing.metaIcon;
  const examColor = EXAM_COLORS[listing.exam];
  const kindColor = KIND_COLORS[listing.kind];

  function goToDetail() {
    navigate({ to: "/course/$kind/$id", params: { kind: routeKind, id: listing.id } });
  }

  return (
    <div className="clay flex flex-col overflow-hidden p-3">
      <div
        className="relative flex h-28 items-center justify-center overflow-hidden rounded-2xl"
        style={{ background: kindColor.soft }}
      >
        {listing.thumbnailUrl ? (
          <img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : listing.kind === "Test Series" ? (
          <BookOpen className="h-9 w-9" style={{ color: kindColor.deep, opacity: 0.6 }} strokeWidth={1.5} />
        ) : (
          <Users2 className="h-9 w-9" style={{ color: kindColor.deep, opacity: 0.6 }} strokeWidth={1.5} />
        )}
        <span
          className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow-sm"
          style={{ background: examColor.deep }}
        >
          {EXAM_LABELS[listing.exam]}
        </span>
        {showKindBadge && (
          <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold text-foreground/70 shadow-sm">
            {listing.kind}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 pt-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-bold leading-tight tracking-tight text-foreground">{listing.title}</h3>
          <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold text-foreground/50">
            {listing.track || "All"}
          </span>
        </div>

        <div className="mb-4 flex items-center gap-1.5 text-xs text-foreground/60">
          <MetaIcon className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
          <span className="truncate">{listing.metaLine}</span>
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          {listing.purchased ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mint-soft)] px-3 py-1 text-xs font-bold text-foreground">
              <BadgeCheck className="h-3.5 w-3.5" />
              You're in
            </span>
          ) : listing.sellingPrice === 0 ? (
            <span className="font-display text-lg font-bold" style={{ color: kindColor.deep }}>
              Free
            </span>
          ) : (
            <>
              <span className="font-display text-lg font-bold text-foreground">₹{listing.sellingPrice.toLocaleString()}</span>
              {listing.crossedPrice > listing.sellingPrice && (
                <span className="text-sm text-foreground/40 line-through">₹{listing.crossedPrice.toLocaleString()}</span>
              )}
              {listing.discountPercent > 0 && (
                <span className="text-xs font-bold" style={{ color: kindColor.deep }}>
                  {listing.discountPercent}% off
                </span>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={goToDetail}
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-white transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: kindColor.deep }}
        >
          <span>{listing.purchased ? "Study now" : listing.sellingPrice === 0 ? "Get for free" : "Buy now"}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SoldTestCard({ test }: { test: SoldTestEntry }) {
  const navigate = useNavigate();

  function goToDetail() {
    navigate({ to: "/sold-test/$id", params: { id: test.id } });
  }

  return (
    <div className="clay flex flex-col overflow-hidden p-3">
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-2xl" style={{ background: AMBER_SOFT }}>
        <ClipboardList className="h-9 w-9" style={{ color: AMBER_DEEP, opacity: 0.55 }} strokeWidth={1.5} />
      </div>

      <div className="flex flex-1 flex-col p-3 pt-4">
        <h3 className="mb-2 font-display text-base font-bold leading-tight tracking-tight text-foreground">{test.name}</h3>

        <p className="mb-4 truncate text-xs text-foreground/60">
          By {test.mentorName} · {test.totalQuestions}Q · {test.durationMinutes}m
        </p>

        <div className="mb-3 flex items-baseline gap-2">
          {test.purchased ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mint-soft)] px-3 py-1 text-xs font-bold text-foreground">
              <BadgeCheck className="h-3.5 w-3.5" />
              You're in
            </span>
          ) : (
            <span className="font-display text-lg font-bold text-foreground">₹{test.price.toLocaleString()}</span>
          )}
        </div>

        <button
          type="button"
          onClick={goToDetail}
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-white transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: AMBER_DEEP }}
        >
          <span>{test.purchased ? "Start test" : "Buy now"}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MentorCard({ mentor }: { mentor: MentorDirectoryEntry }) {
  return (
    <Link
      to="/mentor-profile/$mentorId"
      params={{ mentorId: mentor.id }}
      className="clay flex flex-col overflow-hidden p-4 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ background: PURPLE_SOFT }}
        >
          {mentor.profilePictureUrl ? (
            <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold" style={{ color: PURPLE_DEEP }}>
              {mentor.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-foreground">{mentor.name}</p>
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-white" style={{ fill: PURPLE_DEEP }} />
          </div>
          {mentor.yearOfStudy && (
            <div className="flex items-center gap-1 text-xs text-foreground/50">
              <GraduationCap className="h-3 w-3 shrink-0" />
              <span className="truncate">{mentor.yearOfStudy}</span>
            </div>
          )}
        </div>
        {mentor.avgRating !== null && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold"
            style={{ background: AMBER_SOFT, color: AMBER_DEEP }}
          >
            <Star className="h-3 w-3" style={{ fill: AMBER_DEEP }} />
            {mentor.avgRating}
          </span>
        )}
      </div>

      {mentor.aboutText && <p className="mb-3 line-clamp-2 text-xs text-foreground/60">{mentor.aboutText}</p>}

      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-[11px] font-bold text-foreground/50">
          {mentor.batches.length} batch{mentor.batches.length === 1 ? "" : "es"}
        </span>
        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: PURPLE_DEEP }}>
          View profile
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}