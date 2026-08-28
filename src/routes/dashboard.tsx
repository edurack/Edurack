import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  BookOpen,
  Users2,
  Calendar,
  ArrowRight,
  ChevronRight,
  GraduationCap,
  Star,
  BadgeCheck,
  Target,
  Layers,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/server-functions/profile";
import { listPublicBundles, listPublicMentorshipBatches, listPublicMentors } from "@/server-functions/catalog";
import { getMyPurchases } from "@/server-functions/student-data";
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

// Maps a student's free-text targetExam (from onboarding, e.g. "JEE Main +
// Advanced", "NEET + AIIMS") down to one of the four platform exam keys, so
// recommendations can match on exam even though the profile field itself
// isn't a strict enum. Falls back to null (no exam match applied) rather
// than guessing wrong.
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
  // Optional and defaulted below — older catalog rows or a not-yet-updated
  // catalog.ts won't send this, so every read of `exam` goes through
  // `?? "neet"` rather than assuming the field exists.
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
  metaLines: { icon: typeof Calendar; text: string }[];
  searchText: string;
  // Whether the signed-in student already owns this item, derived from
  // getMyPurchases() and keyed as `${itemType}:${itemId}` to exactly match
  // the shape purchases.ts hands back. Drives Buy Now vs Study Now below.
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
    metaLines: [
      { icon: BookOpen, text: b.features[0] ?? `${EXAM_LABELS[exam]} test series` },
      { icon: Calendar, text: `Access until ${new Date(b.expiryDate).toLocaleDateString()}` },
    ],
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
    metaLines: [
      { icon: Users2, text: b.mentorName ? `Mentor: ${b.mentorName}` : "Mentor: unassigned" },
      { icon: BookOpen, text: b.highlights[0] ?? "1:1 mentorship" },
    ],
    searchText: `${b.name} ${b.track} ${EXAM_LABELS[exam]} ${b.highlights.join(" ")} ${b.mentorName ?? ""}`.toLowerCase(),
    purchased: purchasedKeys.has(`mentorship:${b.id}`),
  };
}

const TRACK_FILTERS: TrackFilter[] = ["All", "Dropper", "11th", "12th"];
const EXAM_FILTERS: ExamFilter[] = ["All", "neet", "jee", "cuet", "ipmat"];

function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [batches, setBatches] = useState<MentorshipBatch[] | null>(null);
  const [mentors, setMentors] = useState<MentorDirectoryEntry[] | null>(null);
  const [purchasedKeys, setPurchasedKeys] = useState<Set<string> | null>(null);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("All");
  const [examFilter, setExamFilter] = useState<ExamFilter>("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const [{ profile: p }, { bundles: bundleRows }, { batches: batchRows }, { mentors: mentorRows }, { purchases }] =
        await Promise.all([
          getProfile({ data: { token } }),
          listPublicBundles({ data: { token } }),
          listPublicMentorshipBatches({ data: { token } }),
          listPublicMentors({ data: { token } }),
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
      setPurchasedKeys(new Set(purchases.map((pu) => `${pu.itemType}:${pu.itemId}`)));
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

  const recommended = useMemo(() => {
    if (!allListings || !track) return [];
    // Match on track always; match on exam too when we could confidently
    // resolve one from the student's targetExam string. If we couldn't
    // (unrecognized or not-yet-set targetExam), fall back to track-only so
    // nothing silently disappears from recommendations.
    return allListings.filter((l) => l.track === track && (!examKey || l.exam === examKey));
  }, [allListings, track, examKey]);

  const browsed = useMemo(() => {
    if (!allListings) return [];
    return allListings.filter(
      (l) => (trackFilter === "All" || l.track === trackFilter) && (examFilter === "All" || l.exam === examFilter),
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

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-70 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-70 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[var(--mint-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} displayName={profile?.fullName} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* ── Welcome card — one cohesive block instead of scattered pills ── */}
        <div className="clay mb-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Welcome{profile?.fullName ? `, ${profile.fullName}` : user.displayName ? `, ${user.displayName}` : ""}
              </h1>
              <p className="mt-1 truncate text-sm text-foreground/50">{user.email}</p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <div className="clay-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
                <Target className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-foreground/40">Target Exam</p>
                  <p className="text-xs font-bold text-foreground">{profile?.targetExam || "Not set"}</p>
                </div>
              </div>
              {track && (
                <div className="clay-inset flex items-center gap-2 rounded-2xl bg-[var(--sky-soft)]/40 px-4 py-2.5">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--sky-deep)]" />
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-foreground/40">Category</p>
                    <p className="text-xs font-bold text-foreground">{track}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Always-open unified search ───────────────────────────────── */}
        <UnifiedSearch
          query={query}
          onQueryChange={setQuery}
          mentors={mentors}
          matchedMentors={matchedMentors}
          matchedListings={matchedListings}
          hasQuery={hasQuery}
          loading={mentors === null || allListings === null}
        />

        {track && !hasQuery && (
          <section className="mb-12 mt-10">
            <div className="mb-5">
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Recommended for {track}
                {examKey && <span className="text-foreground/50"> · {EXAM_LABELS[examKey]}</span>}
              </h2>
              <p className="mt-1 text-sm text-foreground/60">
                Test series and mentorships matched to your category
                {examKey ? " and target exam." : "."}
              </p>
            </div>

            {allListings === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
              </div>
            ) : recommended.length === 0 ? (
              <div className="clay p-6 text-center text-sm text-foreground/60">
                Nothing published for {track}
                {examKey ? ` · ${EXAM_LABELS[examKey]}` : ""} yet — check "Browse all batches" below.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {recommended.map((l) => (
                  <ListingCard key={`${l.kind}-${l.id}`} listing={l} />
                ))}
              </div>
            )}
          </section>
        )}

        {!hasQuery && (
          <section className="mt-10">
            <div className="mb-5">
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Browse all batches
              </h2>
              <p className="mt-1 text-sm text-foreground/60">
                Curious what other exams or tracks offer? Filter below — nothing here is locked to yours.
              </p>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {EXAM_FILTERS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setExamFilter(e)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                    examFilter === e ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  {e === "All" ? "All Exams" : EXAM_LABELS[e]}
                </button>
              ))}
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {TRACK_FILTERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrackFilter(t)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                    trackFilter === t ? "clay-btn text-white" : "clay-chip text-foreground/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {allListings === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
              </div>
            ) : browsed.length === 0 ? (
              <div className="clay p-8 text-center text-sm text-foreground/60">
                No batches match this filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {browsed.map((l) => (
                  <ListingCard key={`${l.kind}-${l.id}`} listing={l} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Unified search — always open, results replace the browse sections
// below it while a query is active, mentors ranked above batches ───────────
function UnifiedSearch({
  query,
  onQueryChange,
  matchedMentors,
  matchedListings,
  hasQuery,
  loading,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  mentors: MentorDirectoryEntry[] | null;
  matchedMentors: MentorDirectoryEntry[];
  matchedListings: Listing[];
  hasQuery: boolean;
  loading: boolean;
}) {
  const hasResults = matchedMentors.length > 0 || matchedListings.length > 0;

  return (
    <div>
      <div className="clay-inset flex items-center gap-3 rounded-2xl px-5 py-3.5">
        <Search className="h-4 w-4 shrink-0 text-foreground/40" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search mentors, test series, mentorships…"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
      </div>

      {hasQuery && (
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
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                    Mentors
                  </p>
                  <div className="space-y-1.5">
                    {matchedMentors.map((m) => (
                      <MentorResultRow key={m.id} mentor={m} />
                    ))}
                  </div>
                </div>
              )}

              {matchedListings.length > 0 && (
                <div>
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                    Batches
                  </p>
                  <div className="space-y-1.5">
                    {matchedListings.map((l) => (
                      <ListingResultRow key={`${l.kind}-${l.id}`} listing={l} />
                    ))}
                  </div>
                </div>
              )}
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
      <div className="clay flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
        {mentor.profilePictureUrl ? (
          <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-foreground/50">{mentor.name.charAt(0)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">{mentor.name}</p>
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-[var(--sky-deep)] text-white" />
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground/50">
          {mentor.yearOfStudy && <span className="truncate">{mentor.yearOfStudy}</span>}
          {mentor.avgRating !== null && (
            <span className="flex shrink-0 items-center gap-0.5">
              <Star className="h-3 w-3 fill-[var(--sky-deep)] text-[var(--sky-deep)]" />
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

  function goToDetail() {
    navigate({ to: "/course/$kind/$id", params: { kind: routeKind, id: listing.id } });
  }

  return (
    <button
      onClick={goToDetail}
      className="clay-inset flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 hover:bg-foreground/5"
    >
      <div className="clay flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        {listing.thumbnailUrl ? (
          <img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : listing.kind === "Test Series" ? (
          <BookOpen className="h-4 w-4 text-foreground/40" />
        ) : (
          <Users2 className="h-4 w-4 text-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{listing.title}</p>
        <p className="truncate text-xs text-foreground/50">
          {EXAM_LABELS[listing.exam]} · {listing.kind} · {listing.track || "All tracks"}
        </p>
      </div>
      {listing.purchased && (
        <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold text-foreground">
          Owned
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
    </button>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const routeKind = listing.kind === "Test Series" ? "bundle" : "mentorship";

  function goToDetail() {
    navigate({ to: "/course/$kind/$id", params: { kind: routeKind, id: listing.id } });
  }

  return (
    <div className="clay flex flex-col overflow-hidden p-3">
      <div className="clay-inset relative flex h-32 items-center justify-center overflow-hidden rounded-2xl bg-[var(--sky-soft)]">
        {listing.thumbnailUrl ? (
          <img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : listing.kind === "Test Series" ? (
          <BookOpen className="h-10 w-10 text-foreground/40" strokeWidth={1.5} />
        ) : (
          <Users2 className="h-10 w-10 text-foreground/40" strokeWidth={1.5} />
        )}
        <span className="absolute left-2 top-2 rounded-full bg-[var(--sky-deep)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
          {EXAM_LABELS[listing.exam]}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground/70 shadow-sm">
          {listing.kind}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3 pt-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-display text-base font-bold tracking-tight text-foreground">
            {listing.title}
          </h3>
          <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/50">
            {listing.track || "All tracks"}
          </span>
        </div>

        <div className="mb-4 space-y-1.5">
          {listing.metaLines.map((line, i) => {
            const Icon = line.icon;
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs text-foreground/60">
                <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                <span className="truncate">{line.text}</span>
              </div>
            );
          })}
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          {listing.purchased ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mint-soft)] px-3 py-1 text-xs font-bold text-foreground">
              <BadgeCheck className="h-3.5 w-3.5" />
              Purchased
            </span>
          ) : (
            <>
              <span className="font-display text-lg font-bold text-foreground">
                ₹{listing.sellingPrice.toLocaleString()}
              </span>
              {listing.crossedPrice > listing.sellingPrice && (
                <span className="text-sm text-foreground/40 line-through">
                  ₹{listing.crossedPrice.toLocaleString()}
                </span>
              )}
              {listing.discountPercent > 0 && (
                <span className="text-xs font-semibold text-[var(--sky-deep)]">
                  {listing.discountPercent}% OFF
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToDetail}
            className="clay-btn flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
          >
            <span>{listing.purchased ? "Study Now" : "Buy Now"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="View details"
            onClick={goToDetail}
            className="clay-btn-ghost flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/60 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}