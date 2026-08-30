import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Loader2,
  LayoutDashboard,
  ClipboardList,
  FolderOpen,
  Megaphone,
  LifeBuoy,
  Lock,
  Unlock,
  PlayCircle,
  FileText,
  ChevronDown,
  PhoneCall,
  X,
  Users2,
  BookOpen,
  BarChart3,
  Trophy,
  Building2,
  BookMarked,
  Video,
  CalendarClock,
  Link2,
  Radio,
  MoreVertical,
  CheckCircle2,
  MessageSquare,
  Send,
  BadgeCheck,
  ExternalLink,
  Download,
  ChevronRight,
  Tag,
  XCircle,
} from "lucide-react";
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
} from "@/server-functions/batch-hub";
import { createRazorpayOrder, verifyRazorpayPayment, previewCoupon } from "@/server-functions/payments";
import { listMyAttemptsForTest } from "@/server-functions/test-results";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

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
type TabKey = "overview" | "tests" | "assets" | "announcements" | "chat" | "help";

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
    { key: "assets", label: "Assets", icon: FolderOpen },
    { key: "announcements", label: "Updates", icon: Megaphone },
  ];
  if (kind === "mentorship") {
    base.push({ key: "chat", label: "Chat", icon: MessageSquare });
  }
  base.push({ key: "help", label: "Help", icon: LifeBuoy });
  return base;
}

function CourseHubPage() {
  const { kind, id } = Route.useParams() as { kind: Kind; id: string };
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [bundle, setBundle] = useState<BundleDetail | null>(null);
  const [mentorship, setMentorship] = useState<MentorshipDetail | null>(null);
  const [mentorProfile, setMentorProfile] = useState<MentorProfile | null>(null);
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [isPurchased, setIsPurchased] = useState<boolean | null>(null);
  const [pdfModal, setPdfModal] = useState<{ url: string; name: string } | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // ─── Coupon state (mentorship batches only) ──────────────────────────────
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const TABS = tabsForKind(kind);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const purchase = await hasPurchased({ data: { token, itemType: kind, itemId: id } });
      setIsPurchased(purchase.isPurchased);

      if (kind === "bundle") {
        const [{ bundle: b }, { tests: t }, { announcements: a }] = await Promise.all([
          getPublicBundleDetail({ data: { token, bundleId: id } }),
          listPublicTestsForBundle({ data: { token, bundleId: id } }),
          listPublicBundleAnnouncements({ data: { token, bundleId: id } }),
        ]);
        setBundle(b as BundleDetail | null);
        setTests(t as TestRow[]);
        setAnnouncements(a as AnnouncementRow[]);
      } else {
        const { batch } = await getPublicMentorshipDetail({ data: { token, batchId: id } });
        const batchDetail = batch as MentorshipDetail | null;
        setMentorship(batchDetail);
        setTests([]);

        const [{ sessions: s }, { announcements: a }] = await Promise.all([
          listMentorshipSessionsForStudent({ data: { token, batchId: id } }),
          listPublicMentorshipAnnouncements({ data: { token, batchId: id } }),
        ]);
        setSessions(s as SessionRow[]);
        setAnnouncements(a as AnnouncementRow[]);

        if (batchDetail?.mentorId) {
          const { mentor } = await getPublicMentorProfile({ data: { token, mentorId: batchDetail.mentorId } });
          setMentorProfile(mentor as MentorProfile | null);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kind, id]);

  if (loading || !user || isPurchased === null) {
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
    if (!user || !couponInput.trim() || sellingPrice === undefined) return;
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
  }

  async function handlePurchase() {
    if (!user) return;
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
                  active ? "clay-btn text-white" : "text-foreground/70 hover:translate-x-0.5 hover:bg-foreground/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="clay mb-5 flex items-center gap-4 p-4 sm:mb-6 sm:p-6">
            <div className="clay-inset flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--sky-soft)] sm:h-14 sm:w-14">
              {kind === "bundle" ? (
                <BookOpen className="h-5 w-5 text-foreground/40 sm:h-6 sm:w-6" />
              ) : (
                <Users2 className="h-5 w-5 text-foreground/40 sm:h-6 sm:w-6" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50 sm:text-xs">
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
              />
            )}
            {activeTab === "tests" && kind === "bundle" && (
              <TestsTab tests={tests} isPurchased={isPurchased} navigate={navigate} user={user} />
            )}
            {activeTab === "tests" && kind === "mentorship" && (
              <SessionsTab sessions={sessions} isPurchased={isPurchased} batchId={id} user={user} />
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
              <ChatTab batchId={id} isPurchased={isPurchased} user={user} />
            )}
            {activeTab === "help" && <HelpTab isPurchased={isPurchased} user={user} kind={kind} itemId={id} />}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav
        className={`clay fixed inset-x-3 z-30 flex items-center justify-around gap-0.5 rounded-3xl p-1.5 transition-all duration-300 md:hidden ${
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
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[9px] font-semibold transition-all duration-200 ${
                active ? "clay-btn text-white" : "text-foreground/60"
              }`}
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
                promote bundles (see promoter-portal.ts) */}
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
                ) : (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
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
                    {couponError && <p className="mt-1.5 text-xs font-medium text-rose-600">{couponError}</p>}
                  </div>
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
                    <span className="text-xs font-semibold text-[var(--sky-deep)]">{discountPercent}% OFF</span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-foreground/50">Purchase to unlock everything</p>
              </div>
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="clay-btn flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-105 disabled:opacity-70 disabled:hover:scale-100"
              >
                {purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Purchase"}
              </button>
            </div>
          </div>
          {purchaseError && (
            <div className="clay-inset mx-auto mt-2 max-w-xl rounded-2xl bg-[var(--coral-soft)]/50 px-4 py-2 text-center text-xs font-medium text-foreground">
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
// silently proxying through a third party. ─────────────────────────────────
function PdfPreviewModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={url}
              download={name}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <iframe title={name} src={url} className="clay-inset h-full w-full flex-1 rounded-2xl bg-white" />
      </div>
    </div>
  );
}

function LockGate({ locked, children }: { locked: boolean; children: ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-50">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="clay-inset flex items-center gap-2 rounded-full bg-background/80 px-4 py-2 backdrop-blur-sm">
          <Lock className="h-3.5 w-3.5 text-foreground/50" />
          <span className="text-xs font-semibold text-foreground/60">Purchase to unlock</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mentor bio card — now includes the intro video and a real link to the
// mentor's full public profile page, not just a static name label. ─────────
function MentorBioCard({ mentorProfile }: { mentorProfile: MentorProfile }) {
  const lockedItems = [
    { icon: Trophy, label: "AIIMS / IIT Rank", value: mentorProfile.aiimsIitRank },
    { icon: Building2, label: "College", value: mentorProfile.enrolledCollege },
    { icon: BookMarked, label: "Course", value: mentorProfile.pursuedCourse },
  ].filter((i) => i.value?.trim());

  return (
    <div className="clay p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="clay-inset flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-16 sm:w-16">
          {mentorProfile.profilePictureUrl ? (
            <img src={mentorProfile.profilePictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-lg font-bold text-foreground/50 sm:text-xl">
              {mentorProfile.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50 sm:text-xs">
            Your Mentor
          </p>
          <Link
            to="/mentor-profile/$mentorId"
            params={{ mentorId: mentorProfile.id }}
            className="group mt-0.5 inline-flex items-center gap-1.5"
          >
            <span className="font-display text-base font-bold text-foreground transition-colors group-hover:text-[var(--sky-deep)] sm:text-lg">
              {mentorProfile.name}
            </span>
            <BadgeCheck className="h-4 w-4 shrink-0 fill-[var(--sky-deep)] text-white" />
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
        className="clay-btn-ghost mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-semibold text-foreground/70 transition-transform hover:scale-[1.02]"
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
}: {
  kind: Kind;
  bundle: BundleDetail | null;
  mentorship: MentorshipDetail | null;
  mentorProfile: MentorProfile | null;
  isPurchased: boolean;
  user: { getIdToken: () => Promise<string> };
  itemId: string;
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
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--sky-deep)]" />
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
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--sky-deep)]" />
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
              className="clay-btn flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit request"}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowCallbackForm(true)}
            className="clay-btn inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:scale-105"
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
}: {
  tests: TestRow[] | null;
  isPurchased: boolean;
  navigate: ReturnType<typeof useNavigate>;
  user: { getIdToken: () => Promise<string> };
}) {
  const [attemptsByTest, setAttemptsByTest] = useState<Record<string, { count: number; bestScore: number; totalMarks: number } | undefined>>({});

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!tests || tests.length === 0 || !isPurchased) return;
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
  }, [tests, isPurchased]);

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
                    <span className="inline-flex items-center gap-1.5 text-[var(--coral-soft)]">
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
                    className="clay-btn flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Analysis
                  </button>
                  <button
                    disabled={!isPurchased}
                    onClick={() => navigate({ to: "/test/$testId", params: { testId: t.id } })}
                    className="text-[11px] font-semibold text-[var(--sky-deep)] hover:underline disabled:opacity-40"
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <button
                  disabled={!isPurchased}
                  onClick={() => navigate({ to: "/test/$testId", params: { testId: t.id } })}
                  className="clay-btn flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  <PlayCircle className="h-4 w-4" />
                  Start Test
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
}: {
  sessions: SessionRow[] | null;
  isPurchased: boolean;
  batchId: string;
  user: { getIdToken: () => Promise<string> };
}) {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<string, SessionStatus> | null>(null);

  async function refreshStatuses() {
    const token = await user.getIdToken();
    const { statuses: rows } = await listMySessionStatuses({ data: { token, batchId } });
    setStatuses(Object.fromEntries(rows.map((r) => [r.sessionId, r])));
  }

  useEffect(() => {
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
              <span className="rounded-full bg-[var(--lemon-soft)]/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
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
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--sky-deep)]">
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
                      <span className="rounded-full bg-[var(--coral-soft)]/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
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
                      className="clay-btn flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {primaryLabel}
                    </button>
                  ) : (
                    <a
                      href={s.meetingLink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="clay-btn flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
                    >
                      <Link2 className="h-4 w-4" />
                      {primaryLabel}
                    </a>
                  ))}

                <SessionKebabMenu
                  sessionId={s.id}
                  batchId={batchId}
                  user={user}
                  initialRating={status?.myRating ?? 0}
                  onSaved={refreshStatuses}
                />
              </div>
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
}: {
  sessionId: string;
  batchId: string;
  user: { getIdToken: () => Promise<string> };
  initialRating: number;
  onSaved: () => void;
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
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5"
        aria-label="Review this session"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="clay animate-in fade-in zoom-in-95 absolute right-0 top-full z-20 mt-2 w-64 p-4 duration-150">
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
              className="clay-btn mt-2 w-full rounded-full py-1.5 text-xs font-semibold disabled:opacity-70"
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
  user: { getIdToken: () => Promise<string> };
  onOpenPdf: (url: string, name: string) => void;
}) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);

  useEffect(() => {
    if (kind !== "mentorship") return;
    (async () => {
      const token = await user.getIdToken();
      const { notes: rows } = await listMentorNotesForStudent({ data: { token, batchId } });
      setNotes(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, batchId]);

  if (kind === "mentorship") {
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
}: {
  batchId: string;
  isPurchased: boolean;
  user: { getIdToken: () => Promise<string> };
}) {
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [mentorName, setMentorName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [lockStatus, setLockStatus] = useState<{ isLockedNow: boolean; openFrom: string | null; openUntil: string | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPurchased) return;
    (async () => {
      const token = await user.getIdToken();
      const { mentorId: mid, mentorName: mname } = await getMyMentorForBatch({ data: { token, batchId } });
      setMentorId(mid);
      setMentorName(mname);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, isPurchased]);

  async function refreshAll(mid: string) {
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
    <div className="clay flex h-[28rem] flex-col overflow-hidden sm:h-[32rem]">
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
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              lockStatus.isLockedNow ? "bg-[var(--coral-soft)]/50 text-foreground" : "bg-[var(--mint-soft)]/60 text-foreground"
            }`}
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
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[75%] ${
                  m.sender === "student" ? "clay-btn text-white" : "clay-inset text-foreground"
                }`}
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
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--destructive)]">
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
            className="clay-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:opacity-70 disabled:hover:scale-100"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        {error && <p className="mt-2 text-xs font-medium text-[var(--destructive)]">{error}</p>}
      </div>
    </div>
  );
}

function HelpTab({
  isPurchased,
  user,
  kind,
  itemId,
}: {
  isPurchased: boolean;
  user: { getIdToken: () => Promise<string> };
  kind: Kind;
  itemId: string;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
              className="clay-btn flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-70"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
            </button>
          </form>
        )}
      </div>
    </LockGate>
  );
}