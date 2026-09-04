import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  ArrowLeft,
  BadgeCheck,
  Trophy,
  Building2,
  BookMarked,
  Star,
  Layers3,
  UserX,
  ChevronRight,
  Tag,
  ClipboardList,
  Timer,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { VideoPlayer } from "@/components/clay-video-player";
import { getPublicMentorFullProfile } from "@/server-functions/batch-hub";
import { listPublicSoldTestsForMentor } from "@/server-functions/catalog";

export const Route = createFileRoute("/mentor-profile/$mentorId")({
  component: MentorProfilePage,
});

type Mentor = {
  id: string;
  name: string;
  profilePictureUrl: string | null;
  aboutText: string;
  yearOfStudy: string;
  introVideoUrl: string | null;
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
  avgRating: number | null;
  reviewCount: number;
};

type Batch = { id: string; name: string; track: string; thumbnailUrl: string | null };

type SoldTestEntry = {
  id: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number;
  subjects: string[];
  price: number;
};

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rounded ? "fill-[var(--sky-deep)] text-[var(--sky-deep)]" : "text-foreground/15"
          }`}
        />
      ))}
    </div>
  );
}

function MentorProfilePage() {
  const { mentorId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [soldTests, setSoldTests] = useState<SoldTestEntry[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const [{ mentor: m, batches: b }, { tests: st }] = await Promise.all([
        getPublicMentorFullProfile({ data: { token, mentorId } }),
        listPublicSoldTestsForMentor({ data: { token, mentorId } }),
      ]);
      if (!m) {
        setNotFound(true);
        return;
      }
      setMentor(m);
      setBatches(b);
      setSoldTests(st as SoldTestEntry[]);
    })();
  }, [user, mentorId]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const credentialItems = mentor
    ? [
        { icon: Trophy, label: "AIIMS / IIT Rank", value: mentor.aiimsIitRank },
        { icon: Building2, label: "College", value: mentor.enrolledCollege },
        { icon: BookMarked, label: "Course", value: mentor.pursuedCourse },
      ].filter((i) => i.value?.trim())
    : [];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/60 transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {notFound ? (
          <div className="clay p-10 text-center sm:p-14">
            <div className="clay-inset mx-auto grid h-16 w-16 place-items-center rounded-2xl">
              <UserX className="h-7 w-7 text-foreground/40" strokeWidth={1.5} />
            </div>
            <p className="font-display mt-5 text-lg font-bold text-foreground">Mentor not found</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-foreground/60">
              This mentor profile may have been removed or the link is incorrect.
            </p>
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="clay-btn mt-6 rounded-full px-6 py-2.5 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
            >
              Go to dashboard
            </button>
          </div>
        ) : !mentor ? (
          <div className="space-y-6">
            <div className="clay overflow-hidden p-0">
              <div className="h-20 animate-pulse bg-foreground/5 sm:h-24" />
              <div className="p-5 pt-0 sm:p-6 sm:pt-0">
                <div className="-mt-10 h-20 w-20 animate-pulse rounded-full bg-foreground/10 ring-4 ring-background sm:-mt-12 sm:h-24 sm:w-24" />
                <div className="mt-4 h-5 w-40 animate-pulse rounded-full bg-foreground/10" />
                <div className="mt-2 h-3 w-24 animate-pulse rounded-full bg-foreground/10" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="clay overflow-hidden p-0">
              {/* Banner strip */}
              <div className="h-20 bg-gradient-to-br from-[var(--sky-soft)] to-[var(--teal-soft)] sm:h-24" />

              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="flex items-end justify-between">
                  <div className="clay-inset -mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-background sm:-mt-12 sm:h-24 sm:w-24">
                    {mentor.profilePictureUrl ? (
                      <img src={mentor.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-2xl font-bold text-foreground/50 sm:text-3xl">
                        {mentor.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  {mentor.avgRating !== null && (
                    <div className="clay-inset mb-1 flex items-center gap-2 rounded-full px-3 py-1.5">
                      <StarRating rating={mentor.avgRating} />
                      <span className="text-xs font-bold text-foreground">{mentor.avgRating.toFixed(1)}</span>
                      <span className="text-xs text-foreground/40">({mentor.reviewCount})</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {mentor.name}
                  </h1>
                  <BadgeCheck className="h-5 w-5 shrink-0 fill-[var(--sky-deep)] text-white" />
                </div>
                {mentor.yearOfStudy && <p className="text-sm text-foreground/50">{mentor.yearOfStudy}</p>}

                {mentor.aboutText && (
                  <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/70">
                    {mentor.aboutText}
                  </p>
                )}

                {mentor.introVideoUrl && (
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-foreground/40">
                      Intro video
                    </p>
                    <VideoPlayer src={mentor.introVideoUrl} />
                  </div>
                )}

                {credentialItems.length > 0 && (
                  <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {credentialItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="clay-inset px-3.5 py-3">
                          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                            <Icon className="h-3 w-3" />
                            {item.label}
                          </div>
                          <p className="truncate text-sm font-semibold text-foreground">{item.value}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="clay p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-foreground/60" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
                    Batches taught by {mentor.name.split(" ")[0]}
                  </h2>
                </div>
                {batches.length > 0 && (
                  <span className="clay-chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-foreground/60">
                    {batches.length}
                  </span>
                )}
              </div>

              {batches.length === 0 ? (
                <p className="text-sm text-foreground/60">Not currently assigned to any batch.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {batches.map((b) => (
                    <Link
                      key={b.id}
                      to="/course/$kind/$id"
                      params={{ kind: "mentorship", id: b.id }}
                      className="clay-inset group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="clay flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                        {b.thumbnailUrl ? (
                          <img src={b.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Layers3 className="h-4 w-4 text-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{b.name}</p>
                        {b.track && (
                          <span className="mt-0.5 inline-block rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                            {b.track}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* ── Individual Tests — standalone Sold Tests by this mentor,
                genuinely missing before this fix. ────────────────────── */}
            <div className="clay p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-foreground/60" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/60">
                    Individual tests by {mentor.name.split(" ")[0]}
                  </h2>
                </div>
                {soldTests && soldTests.length > 0 && (
                  <span className="clay-chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-foreground/60">
                    {soldTests.length}
                  </span>
                )}
              </div>

              {soldTests === null ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
                </div>
              ) : soldTests.length === 0 ? (
                <p className="text-sm text-foreground/60">No individual tests published yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {soldTests.map((t) => (
                    <Link
                      key={t.id}
                      to="/sold-test/$id"
                      params={{ id: t.id }}
                      className="clay-inset group flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="clay flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                        <ClipboardList className="h-4 w-4 text-foreground/40" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                          <span className="flex items-center gap-1">
                            <ClipboardList className="h-2.5 w-2.5" /> {t.totalQuestions}Q
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="h-2.5 w-2.5" /> {t.durationMinutes}m
                          </span>
                          <span>₹{t.price}</span>
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}