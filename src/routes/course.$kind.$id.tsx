import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { listAttachedSoldTestsForStudent } from "@/server-functions/batch-hub";
import { IconLoader2 as Loader2, IconLayoutDashboard as LayoutDashboard, IconClipboardList as ClipboardList, IconSpeakerphone as Megaphone, IconLifebuoy as LifeBuoy, IconLock as Lock, IconPlayerPlayFilled as PlayCircle, IconFileText as FileText, IconChevronDown as ChevronDown, IconX as X, IconUsersGroup as Users2, IconBook2 as BookOpen, IconTrophy as Trophy, IconBuilding as Building2, IconBookmark as BookMarked, IconVideo as Video, IconCalendarClock as CalendarClock, IconDotsVertical as MoreVertical, IconCircleCheck as CheckCircle2, IconMessageCircle as MessageSquare, IconSend as Send, IconRosetteDiscountCheck as BadgeCheck, IconExternalLink as ExternalLink, IconDownload as Download, IconChevronRight as ChevronRight, IconTag as Tag, IconCircleX as XCircle, IconLogin as LogIn } from "@tabler/icons-react";
import { FolderOpen, Unlock, PhoneCall, BarChart3, Link2, Radio } from "lucide-react"; // TODO: no Tabler mapping found yet
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app-header";
import { ClayStarRating } from "@/components/clay-star-rating";
import { VideoPlayer } from "@/components/clay-video-player";
import {
  getPublicBundleDetail,
  getPublicMentorshipDetail,
  listPublicTestsForBundle,
  listPublicBundleAnnouncements,
  listPublicMentorshipAnnouncements,
  getPublicMentorProfile,
  listMentorshipSessionsForStudent,
  listMySessionStatuses,
  submitSessionReview,
  getMySessionReview,
  listMentorNotesForStudent,
  getMyMentorForBatch,
  listMyChatWithMentor,
  sendMyChatMessage,
  getChatLockStatusForStudent,
  hasPurchased,
  requestCallback,
  submitSupportTicket,
  listMentorBatchSeriesTestsForStudent,
} from "@/server-functions/batch-hub";
import { createRazorpayOrder, verifyRazorpayPayment, previewCoupon } from "@/server-functions/payments";
import { listMyAttemptsForTest } from "@/server-functions/test-results";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

// A signed-in Firebase user, structurally — every sub-tab below only ever
// needs getIdToken() (plus email, in a couple of purchase flows), so this
// is what they accept instead of the full Firebase User type.
type AuthedUser = { getIdToken: () => Promise<string>; email?: string | null };

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout script")));
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
    document.body.appendChild(script);
  });
}

export const Route = createFileRoute("/course/$kind/$id")({
  component: CourseHubPage,
});

type Kind = "bundle" | "mentorship";
type TabKey = "overview" | "tests" | "seriesTests" | "assets" | "announcements" | "chat" | "help";

// ─── Shared color system, matching the dashboard ────────────────────────
// Bundles (Test Series) are teal, Mentorships are pink — same mapping used
// on the dashboard cards, so clicking into a card carries its color with
// it. Mentor-specific elements use purple, echoing the dashboard's Mentors
// tab. Fallback hex is baked into every value so nothing goes invisible if
// these CSS variables aren't defined yet in globals.css.
const TEAL = { soft: "var(--teal-soft, #E1F5EE)", deep: "var(--teal-deep, #0F6E56)" };
const PINK = { soft: "var(--pink-soft, #FCE7F3)", deep: "var(--pink-deep, #BE185D)" };
const PURPLE = { soft: "var(--purple-soft, #EDE9FE)", deep: "var(--purple-deep, #6D28D9)" };
const AMBER = { soft: "var(--amber-soft, #FEF3C7)", deep: "var(--amber-deep, #B45309)" };
const CORAL = { soft: "var(--coral-soft, #FDE2DA)", deep: "var(--coral-deep, #B3441F)" };
const LEMON = { soft: "var(--lemon-soft, #FBF3C7)", deep: "var(--lemon-deep, #8A6D0B)" };
const DESTRUCTIVE = "var(--destructive, #DC2626)";

const KIND_ACCENT: Record<Kind, { soft: string; deep: string }> = {
  bundle: TEAL,
  mentorship: PINK,
};

type BundleDetail = {
  id: string;
  title: string;
  track: string;
  features: string[];
  sellingPrice: number;
  crossedPrice: number;
  discountPercent: number;
  expiryDate: string;
  thumbnailUrl: string | null;
  syllabusPdfUrls: string[];
  plannerUrls: string[];
};

type MentorshipDetail = {
  id: string;
  name: string;
  track: string;
  highlights: string[];
  sellingPrice: number;
  crossedPrice: number;
  discountPercent: number;
  thumbnailUrl: string | null;
  mentor: { name: string; profilePictureUrl: string | null } | null;
  mentorId: string | null;
};

type MentorProfile = {
  id: string;
  name: string;
  profilePictureUrl: string | null;
  aboutText: string;
  yearOfStudy: string;
  introVideoUrl: string | null;
  aiimsIitRank: string;
  enrolledCollege: string;
  pursuedCourse: string;
};

type TestRow = {
  id: string;
  name: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  liveStart: string;
  liveEnd: string;
};

type SessionRow = {
  id: string;
  track: "OneOnOne" | "BatchMeet" | "AsyncLecture";
  meetingLink: string | null;
  lectureUrl: string | null;
  lectureTitle: string | null;
  durationMinutes: number | null;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled";
};

type BatchSeriesTestRow = {
  id: string;
  name: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  liveStart: string | null;
  liveEnd: string | null;
  price: number | null;
  unlocked: boolean;
  includedWithBatch: boolean;
  isReady: boolean; // false = still "Coming soon", regardless of price/purchase
};

type AnnouncementRow = {
  id: string;
  title?: string | null;
  message: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
};

type NoteRow = { id: string; fileName: string; fileUrl: string; watermarkApplied: boolean };

// Coupon applied in the purchase bar — kept as local state until "Purchase"
// is actually pressed, so retyping/retrying a code never creates a real
// Razorpay order (see previewCoupon in payments.ts).
type AppliedCoupon = {
  code: string;
  studentDiscountAmount: number;
  discountedPrice: number;
};

function tabsForKind(kind: Kind): { key: TabKey; label: string; icon: typeof LayoutDashboard }[] {
  const base: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    {
      key: "tests",
      label: kind === "bundle" ? "Tests" : "Sessions",
      icon: kind === "bundle" ? ClipboardList : CalendarClock,
    },
  ];
  if (kind === "mentorship") {
    base.push({ key: "seriesTests", label: "Test Series", icon: ClipboardList }); // NEW
  }
  base.push(
    { key: "assets", label: "Assets", icon: FolderOpen as any },
    { key: "announcements", label: "Updates", icon: Megaphone },
  );
  if (kind === "mentorship") {
    base.push({ key: "chat", label: "Chat", icon: MessageSquare });
  }
  base.push({ key: "help", label: "Help", icon: LifeBuoy });
  return base;
}

// Small reusable "you need to log in for this" card, used by every tab
// below that needs a real signed-in student (sessions, test series,
// assets/notes, chat) rather than just public browsing data.
function LoginRequiredCard({ label }: { label: string }) {
  return (
    <div className="clay flex flex-col items-center gap-3 p-8 text-center">
      <div className="clay-inset grid h-11 w-11 place-items-center rounded-2xl">
        <LogIn className="h-5 w-5 text-foreground/40" />
      </div>
      <p className="text-sm text-foreground/60">{label}</p>
      <Link
        to="/auth"
        className="clay-btn inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold"
      >
        Log in
      </Link>
    </div>
  );
}

function CourseHubPage() {
  const { kind, id } = Route.useParams() as { kind: Kind; id: string };
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const accent = KIND_ACCENT[kind];

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [bundle, setBundle] = useState<BundleDetail | null>(null);
  const [mentorship, setMentorship] = useState<MentorshipDetail | null>(null);
  const [mentorProfile, setMentorProfile] = useState<MentorProfile | null>(null);
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [isPurchased, setIsPurchased] = useState(false);
  const [publicContentLoaded, setPublicContentLoaded] = useState(false);
  const [pdfModal, setPdfModal] = useState<{ url: string; name: string } | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // ─── Coupon state (mentorship batches only) ──────────────────────────────
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  // NEW: coupon field starts collapsed behind a text link — most students
  // don't have a code, and showing an always-open input plus the price row
  // plus the bottom tab bar ate too much vertical space on short Android
  // screens. See handleRemoveCoupon below, which also re-collapses this.
  const [showCouponField, setShowCouponField] = useState(false);

  const TABS = tabsForKind(kind);

  // ---------------------------------------------------------------------
  // This page is public — browsing a batch/bundle's overview, tests list,
  // and announcements should work for anyone, logged in or not, exactly
  // like /mentor-profile/$mentorId. There is intentionally NO effect here
  // that redirects an anonymous visitor to /auth: login is only required
  // at the moment someone tries to do something that actually needs it
  // (purchase, apply a coupon, request a callback, chat, submit a ticket —
  // see the individual handlers and tabs below, which navigate to /auth
  // themselves on click when there's no user). A previous version of this
  // page force-redirected on mount whenever `!user`, which not only blocked
  // anonymous browsing entirely but also caused a back-button loop: landing
  // back on this page re-ran the same redirect effect and pushed another
  // /auth entry onto history every time.
  // ---------------------------------------------------------------------
  // PERF: this content is public (see comment above), so it must not wait
  // on Firebase Auth to resolve before fetching. `useAuth()`'s `loading`
  // flag depends on an auth-state round trip (an iframe check against the
  // custom `authDomain`, since local storage can't be read cross-origin)
  // that regularly takes 1-2s on its own. Gating this fetch behind it
  // means every anonymous — and most signed-in — visitors stare at a bare
  // spinner for that entire round trip before anything renders, and then
  // the full page pops in at once (this was the single largest contributor
  // to both slow LCP and high CLS on this route). Anonymous requests pass
  // an empty token, which these "public" endpoints already support.
  useEffect(() => {
    (async () => {
      try {
        if (kind === "bundle") {
          const [{ bundle: b }, { tests: t }, { announcements: a }] = await Promise.all([
            getPublicBundleDetail({ data: { token: "", bundleId: id } }),
            listPublicTestsForBundle({ data: { token: "", bundleId: id } }),
            listPublicBundleAnnouncements({ data: { token: "", bundleId: id } }),
          ]);
          setBundle(b as BundleDetail | null);
          setTests(t as TestRow[]);
          setAnnouncements(a as AnnouncementRow[]);
        } else {
          const { batch } = await getPublicMentorshipDetail({ data: { token: "", batchId: id } });
          const batchDetail = batch as MentorshipDetail | null;
          setMentorship(batchDetail);
          setTests([]);

          const { announcements: a } = await listPublicMentorshipAnnouncements({
            data: { token: "", batchId: id },
          });
          setAnnouncements(a as AnnouncementRow[]);

          if (batchDetail?.mentorId) {
            const { mentor } = await getPublicMentorProfile({ data: { token: "", mentorId: batchDetail.mentorId } });
            setMentorProfile(mentor as MentorProfile | null);
          }
        }
      } finally {
        // Set regardless of a null (not-found) result, so a genuinely
        // missing bundle/batch falls through to render instead of spinning
        // forever — matches the original gate's behavior for that case.
        setPublicContentLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  // Auth-gated data (purchase status, the student's own session list) loads
  // in a separate effect once Firebase Auth resolves, so it never blocks
  // the public content above — it just fills in a couple of numbers/tabs a
  // moment later. Both default to "anonymous" values (not purchased, no
  // sessions) until this resolves, which is already the correct state for
  // the ~half of visitors who never sign in.
  useEffect(() => {
    if (loading) return;
    (async () => {
      const token = user ? await user.getIdToken() : "";

      if (user) {
        const purchase = await hasPurchased({ data: { token, itemType: kind, itemId: id } });
        setIsPurchased(purchase.isPurchased);
      } else {
        setIsPurchased(false);
      }

      if (kind === "mentorship") {
        // Announcements are public; the session list is not — it filters
        // OneOnOne sessions by uid, so it genuinely needs a real signed-in
        // student. Anonymous visitors just see an empty Sessions tab (with
        // a "log in" prompt) until they log in.
        const { sessions: s } = user
          ? await listMentorshipSessionsForStudent({ data: { token, batchId: id } })
          : { sessions: [] as SessionRow[] };
        setSessions(s as SessionRow[]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, kind, id]);

  if (!publicContentLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const title = kind === "bundle" ? bundle?.title : mentorship?.name;
  const sellingPrice = kind === "bundle" ? bundle?.sellingPrice : mentorship?.sellingPrice;
  const crossedPrice = kind === "bundle" ? bundle?.crossedPrice : mentorship?.crossedPrice;
  const discountPercent = kind === "bundle" ? bundle?.discountPercent : mentorship?.discountPercent;
  const showPurchaseBar = !isPurchased && sellingPrice !== undefined;
  // sellingPrice is guaranteed defined whenever showPurchaseBar is true, but
  // TypeScript can't trace that through a separate boolean — this fallback
  // just satisfies the type checker; it's never actually 0 in practice
  // since displayPrice is only ever rendered inside the showPurchaseBar block.
  const safeSellingPrice = sellingPrice ?? 0;
  const displayPrice = appliedCoupon ? appliedCoupon.discountedPrice : safeSellingPrice;

  async function handleApplyCoupon() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!couponInput.trim() || sellingPrice === undefined) return;
    setCouponError(null);
    setCouponChecking(true);
    try {
      const token = await user.getIdToken();
      const result = await previewCoupon({
        data: { token, itemType: kind, itemId: id, couponCode: couponInput.trim() },
      });
      setAppliedCoupon({
        code: couponInput.trim(),
        studentDiscountAmount: result.studentDiscountAmount,
        discountedPrice: result.discountedPrice,
      });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : "Couldn't apply that code.");
    } finally {
      setCouponChecking(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
    setShowCouponField(false);
  }

  async function handlePurchase() {
    if (!user) {
      // Explicit, user-initiated redirect — not a mount-time effect — so
      // this can never turn into a back-button loop the way the old
      // always-redirect-on-mount effect did.
      navigate({ to: "/auth" });
      return;
    }
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const token = await user.getIdToken();
      const order = await createRazorpayOrder({
        data: { token, itemType: kind, itemId: id, couponCode: appliedCoupon?.code },
      });
      await loadRazorpayScript();

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Edurack",
        description: order.itemTitle,
        prefill: { email: user.email ?? undefined },
        theme: { color: "#0284c7" },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const freshToken = await user.getIdToken();
            await verifyRazorpayPayment({
              data: {
                token: freshToken,
                itemType: kind,
                itemId: id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            setIsPurchased(true);
          } catch {
            setPurchaseError("Payment succeeded but verification failed. Contact support with your payment ID.");
          } finally {
            setPurchasing(false);
          }
        },
        modal: {
          ondismiss: () => setPurchasing(false),
        },
      });
      razorpay.open();
    } catch (err) {
      console.error("Checkout start error:", err);
      setPurchaseError("Could not start checkout. Please try again.");
      setPurchasing(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[var(--sky-soft)] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-[var(--teal-soft)] opacity-60 blur-3xl" />
      </div>

      <AppHeader user={user} />

      <div
        className={`mx-auto flex max-w-6xl gap-6 px-3 pt-5 sm:px-6 sm:pt-6 ${
          showPurchaseBar ? "pb-64 sm:pb-40" : "pb-28 sm:pb-8"
        }`}
      >
        {/* ── Desktop sidebar ─────────────────────────────────────────── */}
        <aside className="sticky top-20 hidden h-fit w-52 shrink-0 flex-col gap-1 md:flex">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  active ? "text-white" : "text-foreground/70 hover:translate-x-0.5 hover:bg-foreground/5"
                }`}
                style={active ? { background: accent.deep } : undefined}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="clay mb-5 flex items-center gap-4 p-4 sm:mb-6 sm:p-6">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl sm:h-14 sm:w-14"
              style={{ background: accent.soft }}
            >
              {kind === "bundle" ? (
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: accent.deep }} />
              ) : (
                <Users2 className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: accent.deep }} />
              )}
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] font-bold uppercase tracking-wide sm:text-xs"
                style={{ color: accent.deep }}
              >
                {kind === "bundle" ? "Test Series" : "Mentorship"}
              </p>
              <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground sm:text-2xl">
                {title ?? "…"}
              </h1>
            </div>
          </div>

          <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === "overview" && (
              <OverviewTab
                kind={kind}
                bundle={bundle}
                mentorship={mentorship}
                mentorProfile={mentorProfile}
                isPurchased={isPurchased}
                user={user}
                itemId={id}
                navigate={navigate}
                accent={accent}
              />
            )}
            {activeTab === "tests" && kind === "bundle" && (
              <TestsTab tests={tests} isPurchased={isPurchased} navigate={navigate} user={user} accent={accent} />
            )}
           {activeTab === "tests" && kind === "mentorship" && (
              <SessionsTab sessions={sessions} isPurchased={isPurchased} batchId={id} user={user} accent={accent} />
            )}
            {activeTab === "seriesTests" && kind === "mentorship" && (
              <BatchSeriesTestsTab batchId={id} isPurchased={isPurchased} user={user} navigate={navigate} accent={accent} />
            )}
            {activeTab === "assets" && (
              <AssetsTab
                kind={kind}
                bundle={bundle}
                batchId={id}
                isPurchased={isPurchased}
                user={user}
                onOpenPdf={(url, name) => setPdfModal({ url, name })}
              />
            )}
            {activeTab === "announcements" && (
              <AnnouncementsTab announcements={announcements} isPurchased={isPurchased} />
            )}
            {activeTab === "chat" && kind === "mentorship" && (
              <ChatTab batchId={id} isPurchased={isPurchased} user={user} accent={accent} />
            )}
            {activeTab === "help" && <HelpTab isPurchased={isPurchased} user={user} kind={kind} itemId={id} accent={accent} />}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────────
          CHANGED: was `justify-around` with every tab forced to share equal
          width — with 7 tabs (mentorship kind) on a ~360px phone that either
          wrapped labels or shrank tap targets below a usable size. Now each
          tab keeps its natural width (`shrink-0`) and the strip scrolls
          horizontally instead, matching how most native Android app bars
          handle more items than fit. */}
      <nav
        className={`clay fixed inset-x-3 z-30 flex items-center gap-1 overflow-x-auto rounded-3xl p-1.5 transition-all duration-300 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden ${
          showPurchaseBar ? "bottom-[8.5rem]" : "bottom-3"
        }`}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-4 py-2 text-[9px] font-semibold transition-all duration-200 ${
                active ? "text-white" : "text-foreground/60"
              }`}
              style={active ? { background: accent.deep } : undefined}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* ── Sticky purchase bar ─────────────────────────────────────────── */}
      {showPurchaseBar && (
        <div className="fixed inset-x-0 bottom-3 z-20 px-3">
          <div className="clay mx-auto max-w-xl p-4 sm:p-5">
            {/* Coupon apply row — mentorship batches only, promoters never
                promote bundles (see promoter-portal.ts).
                CHANGED: the input used to always render, which — stacked on
                top of the price row and the bottom tab bar right above it —
                consumed a large share of the viewport on short Android
                screens. It now starts collapsed behind a plain text link,
                since most students never enter a code. */}
            {kind === "mentorship" && (
              <div className="mb-3">
                {appliedCoupon ? (
                  <div className="clay-inset flex items-center justify-between gap-2 rounded-2xl bg-[var(--mint-soft)]/40 px-3.5 py-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <Tag className="h-3.5 w-3.5" />
                      "{appliedCoupon.code}" applied — ₹{appliedCoupon.studentDiscountAmount.toLocaleString()} off
                    </span>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-foreground/40 hover:text-foreground/70"
                      aria-label="Remove coupon"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ) : showCouponField ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleApplyCoupon();
                          }
                        }}
                        placeholder="Have a coupon code?"
                        className="clay-inset flex-1 rounded-2xl px-3.5 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
                      />
                      <button
                        onClick={handleApplyCoupon}
                        disabled={!couponInput.trim() || couponChecking}
                        className="clay-btn-ghost shrink-0 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {couponChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                      </button>
                    </div>
                    {couponError && <p className="mt-1.5 text-xs font-medium" style={{ color: DESTRUCTIVE }}>{couponError}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCouponField(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: accent.deep }}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    Have a coupon code?
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-lg font-bold text-foreground">
                    ₹{displayPrice.toLocaleString()}
                  </span>
                  {appliedCoupon ? (
                    <span className="text-sm text-foreground/40 line-through">
                      ₹{safeSellingPrice.toLocaleString()}
                    </span>
                  ) : (
                    crossedPrice &&
                    crossedPrice > safeSellingPrice && (
                      <span className="text-sm text-foreground/40 line-through">
                        ₹{crossedPrice.toLocaleString()}
                      </span>
                    )
                  )}
                  {!appliedCoupon && discountPercent ? (
                    <span className="text-xs font-bold" style={{ color: accent.deep }}>{discountPercent}% off</span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-foreground/50">
                  {user ? "Purchase to unlock everything" : "Log in to purchase and unlock everything"}
                </p>
              </div>
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-105 disabled:opacity-70 disabled:hover:scale-100"
                style={{ background: accent.deep }}
              >
                {purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : user ? "Purchase" : "Log in to purchase"}
              </button>
            </div>
          </div>
          {purchaseError && (
            <div
              className="clay-inset mx-auto mt-2 max-w-xl rounded-2xl px-4 py-2 text-center text-xs font-medium text-foreground"
              style={{ background: CORAL.soft }}
            >
              {purchaseError}
            </div>
          )}
        </div>
      )}

      {pdfModal && <PdfPreviewModal url={pdfModal.url} name={pdfModal.name} onClose={() => setPdfModal(null)} />}
    </div>
  );
}

// ─── Redesigned PDF preview — no Google Docs redirect. Browsers render PDFs
// natively inside an iframe, so this points straight at the source (or the
// base64 data URI for watermarked notes) with a clean header offering
// "Open in new tab" and "Download" as explicit, honest actions rather than
// silently proxying through a third party.
//
// CHANGED: added a loading state with a fallback "open in new tab" hint —
// some Android in-app WebViews (Instagram/Facebook browser, certain banking
// apps) either fail to render a PDF inside an iframe or hang with no visible
// feedback. Now the user sees a spinner and, if it doesn't resolve, an
// explicit way out instead of staring at a blank white box. ─────────────────
function PdfPreviewModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm duration-200 sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-in zoom-in-95 clay flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden p-2 duration-200 sm:p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="clay-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
              <FileText className="h-4 w-4 text-foreground/50" />
            </div>
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={url}
              download={name}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="clay-inset relative h-full w-full flex-1 overflow-hidden rounded-2xl bg-white">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-foreground/30" />
              <p className="text-xs text-foreground/40">
                Loading…{" "}
                <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--sky-deep)] underline">
                  open in a new tab
                </a>{" "}
                if it doesn't appear.
              </p>
            </div>
          )}
          <iframe title={name} src={url} onLoad={() => setLoaded(true)} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}

function LockGate({ locked, label = "Purchase to unlock", children }: { locked: boolean; label?: string; children: ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-50">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="clay-inset flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 backdrop-blur-sm">
          <Lock className="h-3.5 w-3.5 text-foreground/50" />
          <span className="text-xs font-semibold text-foreground/60">{label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mentor bio card — now includes the intro video and a real link to the
// mentor's full public profile page, not just a static name label. Uses the
// purple accent throughout, matching the Mentors tab on the dashboard. ─────
function MentorBioCard({ mentorProfile }: { mentorProfile: MentorProfile }) {
  const lockedItems = [
    { icon: Trophy, label: "AIIMS / IIT Rank", value: mentorProfile.aiimsIitRank },
    { icon: Building2, label: "College", value: mentorProfile.enrolledCollege },
    { icon: BookMarked, label: "Course", value: mentorProfile.pursuedCourse },
  ].filter((i) => i.value?.trim());

  return (
    <div className="clay p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-16 sm:w-16"
          style={{ background: PURPLE.soft }}
        >
          {mentorProfile.profilePictureUrl ? (
            <img src={mentorProfile.profilePictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-lg font-bold sm:text-xl" style={{ color: PURPLE.deep }}>
              {mentorProfile.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide sm:text-xs" style={{ color: PURPLE.deep }}>
            Your Mentor
          </p>
          <Link
            to="/mentor-profile/$mentorId"
            params={{ mentorId: mentorProfile.id }}
            className="group mt-0.5 inline-flex items-center gap-1.5"
          >
            <span className="font-display text-base font-bold text-foreground sm:text-lg">
              {mentorProfile.name}
            </span>
            <BadgeCheck className="h-4 w-4 shrink-0 text-white" style={{ fill: PURPLE.deep }} />
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5" />
          </Link>
          {mentorProfile.yearOfStudy && <p className="text-xs text-foreground/50">{mentorProfile.yearOfStudy}</p>}
        </div>
      </div>

      {mentorProfile.aboutText && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/70">
          {mentorProfile.aboutText}
        </p>
      )}

      {mentorProfile.introVideoUrl && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            Introduction
          </p>
          <VideoPlayer src={mentorProfile.introVideoUrl} />
        </div>
      )}

      {lockedItems.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {lockedItems.map((item) => {
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

      <Link
        to="/mentor-profile/$mentorId"
        params={{ mentorId: mentorProfile.id }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold transition-transform hover:scale-[1.02]"
        style={{ background: PURPLE.soft, color: PURPLE.deep }}
      >
        View full mentor profile
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function OverviewTab({
  kind,
  bundle,
  mentorship,
  mentorProfile,
  isPurchased,
  user,
  itemId,
  navigate,
  accent,
}: {
  kind: Kind;
  bundle: BundleDetail | null;
  mentorship: MentorshipDetail | null;
  mentorProfile: MentorProfile | null;
  isPurchased: boolean;
  user: AuthedUser | null;
  itemId: string;
  navigate: ReturnType<typeof useNavigate>;
  accent: { soft: string; deep: string };
}) {
  const [showCallbackForm, setShowCallbackForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "How long do I get access for?",
      a: "Access runs until the batch's listed expiry date, shown on the checkout banner and pricing details.",
    },
    {
      q: "Can I switch tracks after purchasing?",
      a: "Reach out via the Help tab and our team can help with track changes on a case-by-case basis.",
    },
    { q: "Is this refundable?", a: "Refund policy details will be shown at checkout once payments are live." },
  ];

  async function handleCallbackSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!name.trim() || !phone.trim()) return;
    setSending(true);
    try {
      const token = await user.getIdToken();
      await requestCallback({ data: { token, itemType: kind, itemId, name, phone, message } });
      setSent(true);
      setShowCallbackForm(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {kind === "mentorship" && mentorProfile && <MentorBioCard mentorProfile={mentorProfile} />}

      {kind === "mentorship" && mentorship && (
        <div className="clay p-4 sm:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">Highlights</p>
          <div className="space-y-1.5">
            {mentorship.highlights.map((h, i) => (
              <p key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: accent.deep }} />
                {h}
              </p>
            ))}
          </div>
        </div>
      )}

      {kind === "bundle" && bundle && (
        <div className="clay p-4 sm:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">What's inside</p>
          <div className="space-y-1.5">
            {bundle.features.map((f, i) => (
              <p key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: accent.deep }} />
                {f}
              </p>
            ))}
          </div>
          <p className="mt-3 text-xs text-foreground/50">
            Access until {new Date(bundle.expiryDate).toLocaleDateString()}
          </p>
        </div>
      )}

      <div className="clay p-4 sm:p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">FAQs</p>
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={i} className="clay-inset overflow-hidden rounded-2xl px-4 py-3">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="text-sm font-semibold text-foreground">{f.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`}
                />
              </button>
              <div
                className={`grid transition-all duration-300 ease-out ${
                  openFaq === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="mt-2 text-sm text-foreground/60">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="clay p-4 text-center sm:p-6">
        {sent ? (
          <p className="text-sm font-semibold text-foreground">Thanks — we'll call you back shortly.</p>
        ) : !user ? (
          <button
            onClick={() => navigate({ to: "/auth" })}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105"
            style={{ background: accent.deep }}
          >
            <PhoneCall className="h-4 w-4" />
            Log in to request a Call Back
          </button>
        ) : showCallbackForm ? (
          <form onSubmit={handleCallbackSubmit} className="animate-in fade-in slide-in-from-top-2 space-y-3 text-left duration-200">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything specific you'd like to ask about? (optional)"
              rows={2}
              className="clay-inset w-full resize-none rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-70"
              style={{ background: accent.deep }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit request"}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowCallbackForm(true)}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105"
            style={{ background: accent.deep }}
          >
            <PhoneCall className="h-4 w-4" />
            Request a Call Back
          </button>
        )}
      </div>
    </div>
  );
}

function TestsTab({
  tests,
  isPurchased,
  navigate,
  user,
  accent,
}: {
  tests: TestRow[] | null;
  isPurchased: boolean;
  navigate: ReturnType<typeof useNavigate>;
  user: AuthedUser | null;
  accent: { soft: string; deep: string };
}) {
  const [attemptsByTest, setAttemptsByTest] = useState<Record<string, { count: number; bestScore: number; totalMarks: number } | undefined>>({});

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Guarded by isPurchased (always false for anonymous visitors), so
    // user.getIdToken() below is never reached with a null user.
    if (!tests || tests.length === 0 || !isPurchased || !user) return;
    let cancelled = false;
    (async () => {
      const token = await user.getIdToken();
      const entries = await Promise.all(
        tests.map(async (t) => {
          const { attempts } = await listMyAttemptsForTest({ data: { token, testId: t.id } });
          if (attempts.length === 0) return [t.id, undefined] as const;
          const best = attempts.reduce((max, a) => (a.score > max.score ? a : max), attempts[0]);
          return [t.id, { count: attempts.length, bestScore: best.score, totalMarks: best.totalMarks }] as const;
        }),
      );
      if (cancelled) return;
      setAttemptsByTest(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, isPurchased, user]);

  if (tests === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (tests.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No tests added to this batch yet.</div>;
  }

  return (
    <div className="space-y-3">
      {tests.map((t) => {
        const start = new Date(t.liveStart).getTime();
        const end = new Date(t.liveEnd).getTime();
        const isLive = now >= start && now <= end;
        const isUpcoming = now < start;
        const attempted = attemptsByTest[t.id];

        return (
          <LockGate key={t.id} locked={!isPurchased}>
            <div className="clay flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-foreground/50">
                  {t.totalQuestions} questions · {t.timeLimitMinutes} min
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
                  {isLive ? (
                    <span className="inline-flex items-center gap-1.5" style={{ color: CORAL.deep }}>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> LIVE
                    </span>
                  ) : isUpcoming ? (
                    <span className="text-foreground/50">Starts {new Date(t.liveStart).toLocaleString()}</span>
                  ) : (
                    <span className="text-foreground/50">Held on: {new Date(t.liveStart).toLocaleString()}</span>
                  )}
                  {attempted && (
                    <span className="rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      Attempted {attempted.count}x · Best {attempted.bestScore}/{attempted.totalMarks}
                    </span>
                  )}
                </p>
              </div>

              {attempted ? (
                <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
                  <button
                    onClick={() => navigate({ to: "/test-analysis/$testId", params: { testId: t.id } })}
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white"
                    style={{ background: accent.deep }}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Analysis
                  </button>
                  <button
                    disabled={!isPurchased}
                    onClick={() => navigate({ to: "/test/$testId", params: { testId: t.id } })}
                    className="text-[11px] font-semibold hover:underline disabled:opacity-40"
                    style={{ color: accent.deep }}
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (!user) {
                      navigate({ to: "/auth" });
                      return;
                    }
                    navigate({ to: "/test/$testId", params: { testId: t.id } });
                  }}
                  disabled={!user && isPurchased}
                  className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                  style={{ background: accent.deep }}
                >
                  <PlayCircle className="h-4 w-4" />
                  {isPurchased ? "Start Test" : "Start Test"}
                </button>
              )}
            </div>
          </LockGate>
        );
      })}
    </div>
  );
}

type SessionStatus = { sessionId: string; watchPercent: number; completedLecture: boolean; myRating: number | null };

function SessionsTab({
  sessions,
  isPurchased,
  batchId,
  user,
  accent,
}: {
  sessions: SessionRow[] | null;
  isPurchased: boolean;
  batchId: string;
  user: AuthedUser | null;
  accent: { soft: string; deep: string };
}) {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<string, SessionStatus> | null>(null);

  async function refreshStatuses() {
    if (!user) return;
    const token = await user.getIdToken();
    const { statuses: rows } = await listMySessionStatuses({ data: { token, batchId } });
    setStatuses(Object.fromEntries(rows.map((r) => [r.sessionId, r])));
  }

  useEffect(() => {
    // sessions is only ever non-empty here when `user` is truthy — see the
    // page-level effect, which skips fetching sessions entirely for
    // anonymous visitors — but the `user` guard inside refreshStatuses
    // above is kept as a second line of defense either way.
    if (sessions && sessions.length > 0) refreshStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, batchId]);

  if (sessions === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (sessions.length === 0) {
    if (!user) {
      return <LoginRequiredCard label="Log in to see this batch's live sessions and recorded lectures." />;
    }
    return (
      <div className="clay p-8 text-center text-sm text-foreground/60">
        No live sessions scheduled by your mentor yet — check back soon.
      </div>
    );
  }

  const trackMeta = {
    OneOnOne: { label: "1:1 Mentorship", icon: Users2 },
    BatchMeet: { label: "Batch Meet", icon: Video },
    AsyncLecture: { label: "Recorded Lecture", icon: PlayCircle },
  } as const;

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const meta = trackMeta[s.track];
        const Icon = meta.icon;
        const isPast = s.track !== "AsyncLecture" && new Date(s.scheduledAt).getTime() < Date.now();
        const status = statuses?.[s.id];

        let watchBadge: ReactNode = null;
        if (s.track === "AsyncLecture") {
          if (status?.completedLecture) {
            watchBadge = (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-soft)]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                <CheckCircle2 className="h-3 w-3" /> Watched
              </span>
            );
          } else if ((status?.watchPercent ?? 0) > 0) {
            watchBadge = (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: LEMON.soft, color: LEMON.deep }}
              >
                {status?.watchPercent}% watched
              </span>
            );
          } else {
            watchBadge = (
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/50">
                Not watched
              </span>
            );
          }
        } else if (s.status === "completed") {
          watchBadge = (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-soft)]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
              <CheckCircle2 className="h-3 w-3" /> Attended
            </span>
          );
        } else if (!isPast && s.status === "scheduled") {
          watchBadge = (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: accent.deep }}
            >
              <Radio className="h-3 w-3" /> Upcoming
            </span>
          );
        }

        const primaryLabel =
          s.track === "AsyncLecture"
            ? status?.completedLecture
              ? "Revise"
              : (status?.watchPercent ?? 0) > 0
                ? "Continue"
                : "Watch"
            : "Join";

        return (
          <LockGate key={s.id} locked={!isPurchased}>
            <div className="clay flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <div className="clay-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:h-10 sm:w-10">
                  <Icon className="h-4 w-4 text-foreground/50" />
                </div>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                    <span className="truncate">{s.track === "AsyncLecture" ? s.lectureTitle : meta.label}</span>
                    {s.status === "cancelled" && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: CORAL.soft, color: CORAL.deep }}
                      >
                        Cancelled
                      </span>
                    )}
                    {watchBadge}
                  </p>
                  <p className="text-xs text-foreground/50">
                    {s.track === "AsyncLecture" ? (
                      <>Available from {new Date(s.scheduledAt).toLocaleString()}</>
                    ) : (
                      <>
                        {new Date(s.scheduledAt).toLocaleString()}
                        {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                {s.status === "scheduled" &&
                  (s.track === "AsyncLecture" ? (
                    <button
                      onClick={() => navigate({ to: "/lecture/$sessionId", params: { sessionId: s.id } })}
                      className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white"
                      style={{ background: accent.deep }}
                    >
                      <PlayCircle className="h-4 w-4" />
                      {primaryLabel}
                    </button>
                  ) : (
                    <a
                      href={s.meetingLink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white"
                      style={{ background: accent.deep }}
                    >
                      <Link2 className="h-4 w-4" />
                      {primaryLabel}
                    </a>
                  ))}

                {user && (
                  <SessionKebabMenu
                    sessionId={s.id}
                    batchId={batchId}
                    user={user}
                    initialRating={status?.myRating ?? 0}
                    onSaved={refreshStatuses}
                    accent={accent}
                  />
                )}
              </div>
            </div>
          </LockGate>
        );
      })}
    </div>
  );
}

function BatchSeriesTestsTab({
  batchId,
  isPurchased,
  user,
  navigate,
  accent,
}: {
  batchId: string;
  isPurchased: boolean;
  user: AuthedUser | null;
  navigate: ReturnType<typeof useNavigate>;
  accent: { soft: string; deep: string };
}) {
  const [tests, setTests] = useState<BatchSeriesTestRow[] | null>(null);
  const [attemptsByTest, setAttemptsByTest] = useState<
    Record<string, { count: number; bestScore: number; totalMarks: number } | undefined>
  >({});
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    if (!user) return;
    const token = await user.getIdToken();
    const [{ tests: seriesTests }, { tests: soldTests }] = await Promise.all([
      listMentorBatchSeriesTestsForStudent({ data: { token, batchId } }),
      listAttachedSoldTestsForStudent({ data: { token, batchId } }),
    ]);

    // Test Series tests are always free-with-batch — there's no per-test
    // pricing here anymore (that's what Sell Tests is for). "Coming soon"
    // is driven entirely by isReady, which the server derives from
    // ingestion completeness + whether the scheduled live time has passed.
    const mergedSeries: BatchSeriesTestRow[] = seriesTests.map((t) => ({
      id: t.id,
      name: t.name,
      totalQuestions: t.totalQuestions,
      timeLimitMinutes: t.timeLimitMinutes,
      liveStart: t.liveStart,
      liveEnd: t.liveEnd,
      price: null,
      unlocked: t.unlocked,
      includedWithBatch: t.unlocked,
      isReady: t.isReady,
    }));

    // Sold Tests are already fully vetted (live + fully ingested) before
    // they can ever be attached to a batch — see listAttachedSoldTestsForStudent
    // — so they're always "ready".
    const mergedSold: BatchSeriesTestRow[] = soldTests.map((t) => ({
      id: t.id,
      name: t.name,
      totalQuestions: t.totalQuestions,
      timeLimitMinutes: t.durationMinutes,
      liveStart: null,
      liveEnd: null,
      price: t.price,
      unlocked: t.unlocked,
      includedWithBatch: isPurchased && t.unlocked,
      isReady: true,
    }));

    setTests([...mergedSeries, ...mergedSold]);
  }

  useEffect(() => {
    // listMentorBatchSeriesTestsForStudent / listAttachedSoldTestsForStudent
    // both compute per-student unlock status, so they genuinely require a
    // signed-in user — `tests` simply stays null (→ login prompt below)
    // for anonymous visitors instead of calling refresh() at all.
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, user]);

  useEffect(() => {
    if (!tests || !user) return;
    const unlocked = tests.filter((t) => t.unlocked);
    if (unlocked.length === 0) return;
    let cancelled = false;
    (async () => {
      const token = await user.getIdToken();
      const entries = await Promise.all(
        unlocked.map(async (t) => {
          const { attempts } = await listMyAttemptsForTest({ data: { token, testId: t.id } });
          if (attempts.length === 0) return [t.id, undefined] as const;
          const best = attempts.reduce((max, a) => (a.score > max.score ? a : max), attempts[0]);
          return [t.id, { count: attempts.length, bestScore: best.score, totalMarks: best.totalMarks }] as const;
        }),
      );
      if (cancelled) return;
      setAttemptsByTest(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, user]);

  // Standalone purchase — Sold Tests only (Test Series tests have no price
  // and are never individually purchasable, so this is never called for them).
  async function handleBuyTest(test: BatchSeriesTestRow) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setPurchaseError(null);
    setPurchasingId(test.id);
    try {
      const token = await user.getIdToken();
      const order = await createRazorpayOrder({ data: { token, itemType: "mentorTest", itemId: test.id } });
      await loadRazorpayScript();

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Edurack",
        description: order.itemTitle,
        prefill: { email: user.email ?? undefined },
        theme: { color: "#0284c7" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const freshToken = await user.getIdToken();
            await verifyRazorpayPayment({
              data: {
                token: freshToken,
                itemType: "mentorTest",
                itemId: test.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            await refresh();
          } catch {
            setPurchaseError("Payment succeeded but verification failed. Contact support with your payment ID.");
          } finally {
            setPurchasingId(null);
          }
        },
        modal: { ondismiss: () => setPurchasingId(null) },
      });
      razorpay.open();
    } catch (err) {
      console.error("Test checkout start error:", err);
      setPurchaseError("Could not start checkout. Please try again.");
      setPurchasingId(null);
    }
  }

  if (!user) {
    return <LoginRequiredCard label="Log in to see this batch's test series." />;
  }

  if (tests === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="clay p-8 text-center text-sm text-foreground/60">
        Your mentor hasn't sent any tests to this batch yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {purchaseError && (
        <div
          className="clay-inset rounded-2xl px-4 py-2 text-center text-xs font-medium text-foreground"
          style={{ background: CORAL.soft }}
        >
          {purchaseError}
        </div>
      )}

      {tests.map((t) => {
        const isFree = t.price === null;
        const lockedByBatch = isFree && !isPurchased;
        const locked = !t.isReady || lockedByBatch;
        const lockLabel = !t.isReady ? "Coming soon" : "Purchase to unlock";

        const start = t.liveStart ? new Date(t.liveStart).getTime() : null;
        const end = t.liveEnd ? new Date(t.liveEnd).getTime() : null;
        const isLive = t.isReady && start !== null && end !== null && now >= start && now <= end;
        const attempted = attemptsByTest[t.id];

        return (
          <LockGate key={t.id} locked={locked} label={lockLabel}>
            <div className="clay flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                  <span className="truncate">{t.name}</span>
                  {!t.isReady ? (
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/60">
                      Coming soon
                    </span>
                  ) : t.includedWithBatch ? (
                    <span className="rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      Included with batch
                    </span>
                  ) : isFree ? (
                    <span className="rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      Free with batch
                    </span>
                  ) : (
                    <span className="clay-chip rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                      ₹{t.price}
                    </span>
                  )}
                </p>
                <p className="text-xs text-foreground/50">
                  {t.totalQuestions} questions · {t.timeLimitMinutes} min
                </p>
                {t.isReady && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    {start === null ? (
                      <span className="text-foreground/50">Available now</span>
                    ) : isLive ? (
                      <span className="inline-flex items-center gap-1.5" style={{ color: CORAL.deep }}>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> LIVE
                      </span>
                    ) : (
                      <span className="text-foreground/50">Held on: {new Date(t.liveStart as string).toLocaleString()}</span>
                    )}
                    {attempted && (
                      <span className="rounded-full bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                        Attempted {attempted.count}x · Best {attempted.bestScore}/{attempted.totalMarks}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {t.isReady && (
                !t.unlocked ? (
                  !isFree && (
                    <button
                      onClick={() => handleBuyTest(t)}
                      disabled={purchasingId === t.id}
                      className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-70"
                      style={{ background: accent.deep }}
                    >
                      {purchasingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Buy for ₹${t.price}`}
                    </button>
                  )
                ) : attempted ? (
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
                    <button
                      onClick={() => navigate({ to: "/test-analysis/$testId", params: { testId: t.id } })}
                      className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white"
                      style={{ background: accent.deep }}
                    >
                      <BarChart3 className="h-4 w-4" />
                      Analysis
                    </button>
                    <button
                      onClick={() => navigate({ to: "/test/$testId", params: { testId: t.id } })}
                      className="text-[11px] font-semibold hover:underline"
                      style={{ color: accent.deep }}
                    >
                      Retake
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigate({ to: "/test/$testId", params: { testId: t.id } })}
                    className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white"
                    style={{ background: accent.deep }}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start Test
                  </button>
                )
              )}
            </div>
          </LockGate>
        );
      })}
    </div>
  );
}

function SessionKebabMenu({
  sessionId,
  batchId,
  user,
  initialRating,
  onSaved,
  accent,
}: {
  sessionId: string;
  batchId: string;
  user: AuthedUser;
  initialRating: number;
  onSaved: () => void;
  accent: { soft: string; deep: string };
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(initialRating);
  const [reviewText, setReviewText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!loaded) {
      const token = await user.getIdToken();
      const { review } = await getMySessionReview({ data: { token, sessionId } });
      if (review) {
        setRating(review.rating);
        setReviewText(review.reviewText);
      }
      setLoaded(true);
    }
  }

  async function handleSave() {
    if (rating === 0) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      await submitSessionReview({ data: { token, sessionId, batchId, rating, reviewText } });
      setOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5"
        aria-label="Review this session"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* CHANGED: width is now clamped to the viewport (`calc(100vw-2rem)`)
              so the dropdown can't overflow the screen edge on narrow Android
              phones when the trigger button sits mid-row. */}
          <div className="clay animate-in fade-in zoom-in-95 absolute right-0 top-full z-20 mt-2 w-[min(16rem,calc(100vw-2rem))] p-4 duration-150">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Rate this session
            </p>
            <ClayStarRating value={rating} onChange={setRating} size="sm" />
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Optional feedback…"
              rows={2}
              className="clay-inset mt-2 w-full resize-none rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={rating === 0 || saving}
              className="mt-2 w-full rounded-full py-1.5 text-xs font-bold text-white disabled:opacity-70"
              style={{ background: accent.deep }}
            >
              {saving ? "Saving…" : "Submit review"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AssetsTab({
  kind,
  bundle,
  batchId,
  isPurchased,
  user,
  onOpenPdf,
}: {
  kind: Kind;
  bundle: BundleDetail | null;
  batchId: string;
  isPurchased: boolean;
  user: AuthedUser | null;
  onOpenPdf: (url: string, name: string) => void;
}) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);

  useEffect(() => {
    // listMentorNotesForStudent checks this specific student's purchase —
    // genuinely requires a signed-in user.
    if (kind !== "mentorship" || !user) return;
    (async () => {
      const token = await user.getIdToken();
      const { notes: rows } = await listMentorNotesForStudent({ data: { token, batchId } });
      setNotes(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, batchId, user]);

  if (kind === "mentorship") {
    if (!user) {
      return <LoginRequiredCard label="Log in to see this batch's notes and assets." />;
    }
    if (notes === null) {
      return (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      );
    }
    if (notes.length === 0) {
      return (
        <div className="clay p-8 text-center text-sm text-foreground/60">
          Your mentor hasn't uploaded any notes yet.
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {notes.map((n) => (
          <LockGate key={n.id} locked={!isPurchased}>
            <button
              disabled={!isPurchased}
              onClick={() => onOpenPdf(n.fileUrl, n.fileName)}
              className="clay flex w-full items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <div className="clay-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <FileText className="h-4 w-4 text-foreground/50" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{n.fileName}</p>
                <p className="text-xs text-foreground/40">
                  {n.watermarkApplied ? "Watermarked note" : "Pending watermark"}
                </p>
              </div>
            </button>
          </LockGate>
        ))}
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  const assets = [
    ...bundle.syllabusPdfUrls.map((url) => ({ url, label: "Syllabus" })),
    ...bundle.plannerUrls.map((url) => ({ url, label: "Planner" })),
  ];

  if (assets.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No assets uploaded yet.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {assets.map((a, i) => (
        <LockGate key={i} locked={!isPurchased}>
          <button
            disabled={!isPurchased}
            onClick={() => onOpenPdf(a.url, a.label)}
            className="clay flex w-full items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="clay-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <FileText className="h-4 w-4 text-foreground/50" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{a.label}</p>
              <p className="truncate text-xs text-foreground/40">Tap to view</p>
            </div>
          </button>
        </LockGate>
      ))}
    </div>
  );
}

function AnnouncementsTab({
  announcements,
  isPurchased,
}: {
  announcements: AnnouncementRow[] | null;
  isPurchased: boolean;
}) {
  if (announcements === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (announcements.length === 0) {
    return <div className="clay p-8 text-center text-sm text-foreground/60">No announcements yet.</div>;
  }

  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <LockGate key={a.id} locked={!isPurchased}>
          <div className="clay flex gap-3 p-4 transition-transform hover:-translate-y-0.5">
            {a.thumbnailUrl && <img src={a.thumbnailUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0">
              {a.title && <p className="text-sm font-semibold text-foreground">{a.title}</p>}
              {a.message && <p className="text-sm text-foreground/80">{a.message}</p>}
              <p className="mt-1 text-xs text-foreground/40">
                {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
              </p>
            </div>
          </div>
        </LockGate>
      ))}
    </div>
  );
}

type ChatMessage = { id: string; sender: "mentor" | "student"; body: string; createdAt: string | null };

function ChatTab({
  batchId,
  isPurchased,
  user,
  accent,
}: {
  batchId: string;
  isPurchased: boolean;
  user: AuthedUser | null;
  accent: { soft: string; deep: string };
}) {
  const navigate = useNavigate();
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [mentorName, setMentorName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [lockStatus, setLockStatus] = useState<{ isLockedNow: boolean; openFrom: string | null; openUntil: string | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPurchased || !user) return;
    (async () => {
      const token = await user.getIdToken();
      const { mentorId: mid, mentorName: mname } = await getMyMentorForBatch({ data: { token, batchId } });
      setMentorId(mid);
      setMentorName(mname);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, isPurchased, user]);

  async function refreshAll(mid: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const [{ messages: rows }, lock] = await Promise.all([
      listMyChatWithMentor({ data: { token, batchId, mentorId: mid } }),
      getChatLockStatusForStudent({ data: { token, batchId, mentorId: mid } }),
    ]);
    setMessages(rows);
    setLockStatus(lock);
  }

  useEffect(() => {
    if (mentorId) refreshAll(mentorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!draft.trim() || !mentorId) return;

    setSending(true);
    try {
      const token = await user.getIdToken();
      await sendMyChatMessage({ data: { token, batchId, mentorId, body: draft } });
      setDraft("");
      await refreshAll(mentorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return <LoginRequiredCard label="Log in to chat with your mentor." />;
  }

  if (!isPurchased) {
    return (
      <LockGate locked>
        <div className="clay flex h-96 flex-col overflow-hidden" />
      </LockGate>
    );
  }

  if (mentorId === null && mentorName === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (!mentorId) {
    return (
      <div className="clay p-8 text-center text-sm text-foreground/60">
        No mentor is currently assigned to this batch.
      </div>
    );
  }

  return (
    // CHANGED: was a fixed `h-[28rem]` — when the Android on-screen keyboard
    // opens, the browser's visual viewport shrinks but a fixed-height flex
    // column doesn't, so the message input could get pushed out of view.
    // `dvh` (dynamic viewport height) tracks the actual visible area,
    // shrinking the chat box along with the keyboard so the input row
    // stays reachable. `min(28rem, 70dvh)` still caps the height on
    // desktop/tablet where dvh support or large viewports would otherwise
    // make it taller than intended.
    <div className="clay flex h-[min(28rem,70dvh)] flex-col overflow-hidden sm:h-[32rem]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3.5 sm:px-5 sm:py-4">
        <Link
          to="/mentor-profile/$mentorId"
          params={{ mentorId }}
          className="group flex min-w-0 items-center gap-2"
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-foreground/60" />
          <p className="truncate text-sm font-semibold text-foreground group-hover:text-[var(--sky-deep)]">
            Chat with {mentorName}
          </p>
        </Link>
        {lockStatus && (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={
              lockStatus.isLockedNow
                ? { background: CORAL.soft, color: CORAL.deep }
                : { background: "var(--mint-soft)", color: "inherit" }
            }
          >
            {lockStatus.isLockedNow ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            <span className="hidden sm:inline">
              {lockStatus.isLockedNow
                ? `Locked · opens ${lockStatus.openFrom}`
                : lockStatus.openFrom
                  ? `Open until ${lockStatus.openUntil}`
                  : "Open"}
            </span>
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-foreground/50">No messages yet — say hello to your mentor.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "student" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  m.sender === "student"
                    ? "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm text-white sm:max-w-[75%]"
                    : "clay-inset max-w-[80%] rounded-2xl px-3.5 py-2 text-sm text-foreground sm:max-w-[75%]"
                }
                style={m.sender === "student" ? { background: accent.deep } : undefined}
              >
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-foreground/10 p-3">
        {lockStatus?.isLockedNow && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: DESTRUCTIVE }}>
            <Lock className="h-3 w-3" />
            Messaging is locked right now by your mentor.
          </p>
        )}
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            disabled={lockStatus?.isLockedNow}
            className="clay-inset flex-1 rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || lockStatus?.isLockedNow}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 disabled:opacity-70 disabled:hover:scale-100"
            style={{ background: accent.deep }}
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        {error && <p className="mt-2 text-xs font-medium" style={{ color: DESTRUCTIVE }}>{error}</p>}
      </div>
    </div>
  );
}

function HelpTab({
  isPurchased,
  user,
  kind,
  itemId,
  accent,
}: {
  isPurchased: boolean;
  user: AuthedUser | null;
  kind: Kind;
  itemId: string;
  accent: { soft: string; deep: string };
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Defense in depth: the submit button is disabled unless isPurchased
    // (which is always false without a user), but an Enter-key implicit
    // submit in some browsers can bypass a disabled button, so also guard
    // here before ever touching user.getIdToken().
    if (!isPurchased || !user) return;
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      const token = await user.getIdToken();
      await submitSupportTicket({ data: { token, itemType: kind, itemId, subject, message } });
      setSent(true);
      setSubject("");
      setMessage("");
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return <LoginRequiredCard label="Log in to raise a support ticket for this batch." />;
  }

  return (
    <LockGate locked={!isPurchased}>
      <div className="clay p-4 sm:p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/50">
          Raise a ticket for this batch
        </p>
        {sent ? (
          <p className="text-sm font-semibold text-foreground">
            Ticket submitted — our team will follow up with you.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              disabled={!isPurchased}
              className="clay-inset w-full rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none disabled:opacity-50"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or question…"
              rows={4}
              disabled={!isPurchased}
              className="clay-inset w-full resize-none rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isPurchased || sending}
              className="flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-70"
              style={{ background: accent.deep }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
            </button>
          </form>
        )}
      </div>
    </LockGate>
  );
}