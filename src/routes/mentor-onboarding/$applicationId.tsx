// Profile photo and batch thumbnail upload to Supabase Storage (see
// @/lib/supabase.ts for the bucket + policy setup this needs). The upload
// happens directly from the browser and this component only ever ends up
// with a public URL — that URL is what gets submitted with the rest of
// the form, same as if it had been hand-pasted.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, User, GraduationCap, Award,
  FileText, Clock, ShoppingBag, Video, Tag, ImageIcon, IndianRupee,
  CalendarDays, Users2, Megaphone, BookMarked, MapPin, Rocket, CheckCircle2,
  PenLine, AlertCircle, Upload, X, Link2, Eye, ShieldCheck, TrendingUp, Pencil,
} from "lucide-react";
import { supabase, MENTOR_UPLOADS_BUCKET } from "@/lib/supabase";
import {
  getApprovedApplicationSummary,
  submitMentorOnboardingDetails,
  signMentorAgreement,
  FIXED_COMMISSION_PERCENT,
  MIN_WEEKLY_HOURS,
  MIN_BATCH_DURATION_MONTHS,
} from "@/server-functions/mentor-onboarding";

export const Route = createFileRoute("/mentor-onboarding/$applicationId")({
  component: MentorOnboardingPage,
});

// ─── Upload limits ────────────────────────────────────────────────────────
const MAX_PHOTO_BYTES = 1 * 1024 * 1024; // 1MB — profile photo
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024; // 5MB — batch thumbnail

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function uploadImage(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(MENTOR_UPLOADS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    // upsert is deliberately NOT used here: Supabase requires SELECT +
    // UPDATE policies in addition to INSERT for upsert to pass RLS (it
    // has to check for an existing row before deciding insert vs update).
    // Simpler to just always insert to a fresh path — see handleFile's
    // timestamp suffix below — so only the INSERT policy is ever needed.
  });
  if (error) throw error;
  const { data } = supabase.storage.from(MENTOR_UPLOADS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Shared math so the live per-student earnings estimate (Your Batch step,
// preview card, and Review step) always agrees with itself and with the
// fixed commission rate — computed in exactly one place.
function estimateEarningsPerStudent(price: string): number | null {
  const n = Number(price);
  if (!n || n <= 0) return null;
  return Math.round(n * (1 - FIXED_COMMISSION_PERCENT / 100));
}

type FormState = {
  profilePhotoUrl: string;
  fullName: string;
  college: string;
  rank: string;
  aboutText: string;
  weeklyHours: string;
  wantsToSellTestSeries: boolean | null;
  wantsToRecordIntroVideo: boolean | null;
  introVideoUrl: string;
  batchName: string;
  batchThumbnailUrl: string;
  needsThumbnailFromEdurack: boolean;
  batchPrice: string;
  batchDurationMonths: string;
  hasMinStudentCriteria: boolean | null;
  minStudentCriteriaDetails: string;
  needsPromotionAssistance: boolean | null;
  hasSyllabusPdf: boolean | null;
  syllabusPdfUrl: string;
  wantsPlannerDiscussionCall: boolean;
  commissionAgreed: boolean;
  wantsPlatformTour: boolean | null;
  preferredLaunchDate: string;
};

const emptyForm: FormState = {
  profilePhotoUrl: "",
  fullName: "",
  college: "",
  rank: "",
  aboutText: "",
  weeklyHours: "",
  wantsToSellTestSeries: null,
  wantsToRecordIntroVideo: null,
  introVideoUrl: "",
  batchName: "",
  batchThumbnailUrl: "",
  needsThumbnailFromEdurack: false,
  batchPrice: "",
  batchDurationMonths: "",
  hasMinStudentCriteria: null,
  minStudentCriteriaDetails: "",
  needsPromotionAssistance: null,
  hasSyllabusPdf: null,
  syllabusPdfUrl: "",
  wantsPlannerDiscussionCall: false,
  commissionAgreed: false,
  wantsPlatformTour: null,
  preferredLaunchDate: "",
};

const STEPS = [
  "About You",
  "Beyond This Batch",
  "Your Batch",
  "Materials & Promotion",
  "Terms & Launch",
  "Review",
  "Agreement",
] as const;

const ABOUT_YOU_STEP = 0;
const BEYOND_BATCH_STEP = 1;
const YOUR_BATCH_STEP = 2;
const MATERIALS_STEP = 3;
const TERMS_STEP = 4;
const REVIEW_STEP = 5;
const AGREEMENT_STEP = 6;

// Shown in the live preview panel, one per step — gives the mentor a
// reason for each question instead of just a bare form field.
const STEP_TIPS: { title: string; body: string }[] = [
  {
    title: "Why we ask this",
    body: "Your photo and bio are the first thing students see. A real photo and an honest prep story build trust faster than credentials alone.",
  },
  {
    title: "Good to know",
    body: "Nothing here locks you in — you can add a test series or record an intro video later from your mentor dashboard, no rush.",
  },
  {
    title: "Pricing tip",
    body: "Batches priced ₹1,999–₹4,999 for a 4–6 month program tend to convert best. You can always adjust price closer to launch.",
  },
  {
    title: "Optional, not required",
    body: "Promotion help and syllabus uploads are optional — skip either if you'd rather handle it yourself for now.",
  },
  {
    title: "Fixed, not negotiable",
    body: `EDURACK's commission is a flat ${FIXED_COMMISSION_PERCENT}% for every mentor — this keeps things simple and fair across the platform.`,
  },
  {
    title: "Double-check everything",
    body: "This is your last chance to fix anything before it's saved. Click Edit on any section below to jump straight back to it.",
  },
  {
    title: "Last step",
    body: "Once you confirm, our team reviews your submission and reaches out to schedule your batch launch.",
  },
];

function draftKey(applicationId: string) {
  return `edurack_mentor_onboarding_draft_${applicationId}`;
}

function MentorOnboardingPage() {
  const { applicationId } = Route.useParams();
  const [phase, setPhase] = useState<"loading" | "invalid" | "form" | "signed">("loading");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Load application status, then restore any local draft on top of it.
  useEffect(() => {
    (async () => {
      try {
        const summary = await getApprovedApplicationSummary({ data: { applicationId } });
        if (!summary.found || !summary.approved) {
          setPhase("invalid");
          return;
        }
        if (summary.alreadySigned) {
          setPhase("signed");
          return;
        }
        setAlreadySubmitted(summary.alreadySubmitted);

        const saved = localStorage.getItem(draftKey(applicationId));
        if (saved) {
          setForm(JSON.parse(saved));
        } else {
          setForm((prev) => ({ ...prev, fullName: summary.fullName }));
        }
        setPhase("form");
      } catch {
        setPhase("invalid");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  // Autosave every change to localStorage — this is the "temporary until
  // submitted" storage the mentor can safely close the tab on and resume.
  // Note: this stores the uploaded-file *download URLs*, not the files
  // themselves, so drafts stay small even with photos attached.
  useEffect(() => {
    if (phase !== "form") return;
    localStorage.setItem(draftKey(applicationId), JSON.stringify(form));
  }, [form, phase, applicationId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(s: number): string | null {
    if (s === ABOUT_YOU_STEP) {
      if (!form.fullName.trim()) return "Enter your full name.";
      if (!form.college.trim()) return "Enter your college / institution.";
      if (!form.aboutText.trim()) return "Write a short bio.";
      const words = form.aboutText.trim().split(/\s+/).filter(Boolean).length;
      if (words > 220) return "Keep the bio to roughly 200 words.";
      if (!form.weeklyHours.trim()) return "Enter your weekly time commitment.";
      if (Number(form.weeklyHours) < MIN_WEEKLY_HOURS) {
        return `Weekly time commitment must be at least ${MIN_WEEKLY_HOURS} hours.`;
      }
    }
    if (s === BEYOND_BATCH_STEP) {
      if (form.wantsToSellTestSeries === null) return "Let us know if you'd like to sell a test series too.";
      if (form.wantsToRecordIntroVideo === null) return "Let us know about the intro video.";
    }
    if (s === YOUR_BATCH_STEP) {
      if (!form.batchName.trim()) return "Enter your batch name.";
      if (!form.batchPrice.trim() || Number(form.batchPrice) <= 0) return "Enter a valid batch price.";
      if (!form.batchDurationMonths.trim()) return "Enter the batch duration.";
      if (Number(form.batchDurationMonths) < MIN_BATCH_DURATION_MONTHS) {
        return `Batch duration must be at least ${MIN_BATCH_DURATION_MONTHS} months.`;
      }
      if (form.hasMinStudentCriteria === null) return "Let us know about minimum student criteria.";
    }
    if (s === MATERIALS_STEP) {
      if (form.needsPromotionAssistance === null) return "Let us know if you'd like promotion assistance.";
      if (form.hasSyllabusPdf === null) return "Let us know about your syllabus/planner PDF.";
    }
    if (s === TERMS_STEP) {
      if (!form.commissionAgreed) return `You must agree to the fixed ${FIXED_COMMISSION_PERCENT}% commission rate to continue.`;
      if (form.wantsPlatformTour === null) return "Let us know about a platform walkthrough.";
      if (!form.preferredLaunchDate.trim()) return "Pick a preferred launch date.";
    }
    return null;
  }

  // Jump directly to any earlier step — used by both the clickable
  // progress dots and the Review step's per-section Edit buttons.
  function goToStep(target: number) {
    setError(null);
    setStep(target);
  }

  async function handleNext() {
    const err = validateStep(step);
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  // Submission now happens once, when confirming the Review step — not
  // earlier — so nothing is saved to the server until the mentor has seen
  // every section laid out together and actively confirmed it.
  async function handleConfirmReview() {
    setSubmitting(true);
    setError(null);
    try {
      await submitMentorOnboardingDetails({
        data: {
          applicationId,
          ...form,
          wantsToSellTestSeries: Boolean(form.wantsToSellTestSeries),
          wantsToRecordIntroVideo: Boolean(form.wantsToRecordIntroVideo),
          hasMinStudentCriteria: Boolean(form.hasMinStudentCriteria),
          needsPromotionAssistance: Boolean(form.needsPromotionAssistance),
          hasSyllabusPdf: Boolean(form.hasSyllabusPdf),
          wantsPlatformTour: Boolean(form.wantsPlatformTour),
          commissionAgreed: form.commissionAgreed,
          weeklyHours: Number(form.weeklyHours),
          batchPrice: Number(form.batchPrice),
          batchDurationMonths: Number(form.batchDurationMonths),
        },
      });
      setStep(AGREEMENT_STEP);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleSigned() {
    localStorage.removeItem(draftKey(applicationId));
    setPhase("signed");
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="clay max-w-md p-8 text-center">
          <div className="clay-inset mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl">
            <AlertCircle className="h-6 w-6 text-foreground/40" />
          </div>
          <p className="font-display text-lg font-bold text-foreground">Link not valid</p>
          <p className="mt-2 text-sm text-foreground/60">
            This onboarding link doesn't correspond to an approved application. If you believe this is
            a mistake, reach out to the EDURACK team.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "signed") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="clay max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--mint-soft)]">
            <CheckCircle2 className="h-7 w-7 text-foreground" />
          </div>
          <p className="font-display text-lg font-bold text-foreground">You're all set</p>
          <p className="mt-2 text-sm text-foreground/60">
            Your onboarding details and signed agreement are on file. Our team will follow up before
            your batch goes live.
          </p>
        </div>
      </div>
    );
  }

  const isReviewStep = step === REVIEW_STEP;
  const isAgreementStep = step === AGREEMENT_STEP;

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <div className="mb-6 text-center lg:text-left">
            <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 lg:mx-0">
              <Sparkles className="h-3.5 w-3.5" />
              {alreadySubmitted ? "Resume your onboarding" : "Welcome to EDURACK"}
            </div>
            <h1 className="fluid-h2 mt-4 font-display font-extrabold text-slate-900">Set up your batch</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 lg:mx-0">
              A few details so we can get your mentor space ready to launch. Your progress is saved
              automatically — safe to close this and come back.
            </p>
          </div>

          {/* Progress — completed steps are clickable so you can jump back */}
          <div className="mb-2 flex items-center gap-1.5">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => i < step && goToStep(i)}
                aria-label={`Go back to ${label}`}
                className={`h-1.5 flex-1 rounded-full border-0 p-0 transition-colors duration-300 ${
                  i <= step ? "bg-[var(--sky-deep)]" : "bg-slate-200"
                } ${i < step ? "cursor-pointer" : "cursor-default"}`}
              />
            ))}
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>

          {/* Mobile-only: peek at the live preview without the side panel */}
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(true)}
            className="clay-btn-ghost mb-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold lg:hidden"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview how this looks
          </button>

          <div className="clay p-6 sm:p-8">
            <div key={step} className="animate-in fade-in slide-in-from-right-2 min-h-[16rem] duration-200">
              {step === ABOUT_YOU_STEP && <StepAboutYou form={form} set={set} applicationId={applicationId} />}
              {step === BEYOND_BATCH_STEP && <StepBeyondBatch form={form} set={set} />}
              {step === YOUR_BATCH_STEP && <StepYourBatch form={form} set={set} applicationId={applicationId} />}
              {step === MATERIALS_STEP && <StepMaterialsPromotion form={form} set={set} />}
              {step === TERMS_STEP && <StepTermsLaunch form={form} set={set} />}
              {isReviewStep && <ReviewStep form={form} onEditStep={goToStep} />}
              {isAgreementStep && (
                <AgreementStep
                  applicationId={applicationId}
                  fullName={form.fullName}
                  onBack={handleBack}
                  onSigned={handleSigned}
                />
              )}
            </div>

            {error && (
              <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
            )}

            {/* Nav bar — hidden on the Agreement step, which has its own
                Back + Confirm buttons since it isn't a linear "next" action. */}
            {!isAgreementStep && (
              <div className="mt-6 flex items-center gap-3">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="clay-btn-ghost flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={isReviewStep ? handleConfirmReview : handleNext}
                  disabled={submitting}
                  className="clay-btn flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold disabled:opacity-70"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>{isReviewStep ? "Confirm & Continue to Agreement" : "Continue"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <LivePreviewCard form={form} activeStep={step} className="sticky top-6 hidden lg:flex" />
      </div>

      {/* Mobile preview sheet */}
      {mobilePreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
          onClick={() => setMobilePreviewOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Live preview</span>
              <button onClick={() => setMobilePreviewOpen(false)} aria-label="Close preview">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <LivePreviewCard form={form} activeStep={step} className="flex" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live preview panel ───────────────────────────────────────────────────
// Turns the abstract form fields into an actual mentor card + batch card as
// the mentor types, so filling this out feels like building something
// rather than filling out a survey. Also carries the per-step contextual
// tip from STEP_TIPS so the "why are you asking this" question gets
// answered inline instead of nowhere.
function LivePreviewCard({
  form,
  activeStep,
  className = "",
}: {
  form: FormState;
  activeStep: number;
  className?: string;
}) {
  const initials = form.fullName.trim() ? form.fullName.trim().charAt(0).toUpperCase() : "?";
  const tip = STEP_TIPS[activeStep] ?? STEP_TIPS[STEP_TIPS.length - 1];
  const perStudent = estimateEarningsPerStudent(form.batchPrice);

  return (
    <div className={`clay w-full max-w-xs flex-col gap-4 p-5 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Eye className="h-3.5 w-3.5" />
        Live preview
      </div>

      {/* Mentor mini-card */}
      <div
        className={`clay-inset rounded-2xl p-4 transition-shadow duration-300 ${
          activeStep === ABOUT_YOU_STEP ? "ring-2 ring-[var(--sky-deep)]" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="clay flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full">
            {form.profilePhotoUrl ? (
              <img src={form.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-base font-bold text-slate-400">{initials}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{form.fullName || "Your name"}</p>
            <p className="truncate text-xs text-slate-500">
              {form.college || "Your college"}
              {form.rank ? ` · ${form.rank}` : ""}
            </p>
          </div>
        </div>
        {form.aboutText && <p className="mt-2 line-clamp-3 text-xs text-slate-600">{form.aboutText}</p>}
        {form.weeklyHours && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            <Clock className="h-3 w-3" />
            {form.weeklyHours} hrs/week
          </p>
        )}
      </div>

      {/* Batch mini-card */}
      <div
        className={`clay-inset rounded-2xl p-4 transition-shadow duration-300 ${
          activeStep === YOUR_BATCH_STEP ? "ring-2 ring-[var(--sky-deep)]" : ""
        }`}
      >
        <div className="mb-2 h-20 w-full overflow-hidden rounded-xl bg-slate-100">
          {form.batchThumbnailUrl ? (
            <img src={form.batchThumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <p className="truncate text-sm font-bold text-slate-900">{form.batchName || "Your batch name"}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {form.batchPrice ? `₹${Number(form.batchPrice).toLocaleString()}` : "₹—"} ·{" "}
          {form.batchDurationMonths ? `${form.batchDurationMonths} mo` : "— mo"}
        </p>
        {perStudent !== null && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <TrendingUp className="h-3 w-3" />
            ≈ ₹{perStudent.toLocaleString()} / student
          </p>
        )}
      </div>

      {/* Contextual tip for the current step */}
      <div className="rounded-2xl bg-[var(--sky-soft)]/50 p-4 text-xs text-slate-700">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
          <Sparkles className="h-3.5 w-3.5" />
          {tip.title}
        </p>
        <p>{tip.body}</p>
      </div>
    </div>
  );
}

// ─── Shared field wrappers ───────────────────────────────────────────────

function Field({ label, icon: Icon, children }: { label: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="clay-inset w-full rounded-2xl px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
    />
  );
}

function YesNoToggle({ value, onChange, yesLabel = "Yes", noLabel = "No" }: { value: boolean | null; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string }) {
  return (
    <div className="clay-inset flex gap-1 p-1">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
          value === true ? "clay-btn text-white" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
          value === false ? "clay-btn text-white" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        {noLabel}
      </button>
    </div>
  );
}

// ─── Image upload field ──────────────────────────────────────────────────
// Shared by the profile photo (1MB cap) and batch thumbnail (5MB cap)
// fields. Validates size client-side before ever starting the upload,
// shows a preview once uploaded, and stores the resulting Storage
// download URL back into form state — the rest of the form/submission
// pipeline is unchanged, it just receives a real URL instead of a
// hand-typed one.
function ImageUploadField({
  label,
  icon,
  value,
  onChange,
  storagePath,
  maxBytes,
  disabled,
  shape = "square",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (url: string) => void;
  storagePath: string;
  maxBytes: number;
  disabled?: boolean;
  shape?: "square" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`That file is ${formatBytes(file.size)} — please choose one under ${formatBytes(maxBytes)}.`);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      // Unique suffix per upload so "Replace photo" never collides with the
      // previous file at the same path — every upload is a fresh insert.
      const uniquePath = `${storagePath}-${Date.now()}.${ext}`;
      const url = await uploadImage(file, uniquePath);
      onChange(url);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <Field label={label} icon={icon}>
        <div className="flex items-center gap-3">
          <div
            className={`clay-inset relative flex shrink-0 items-center justify-center overflow-hidden ${
              shape === "square" ? "h-16 w-16 rounded-2xl" : "h-16 w-28 rounded-2xl"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : value ? (
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-slate-300" />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              disabled={disabled || uploading}
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="hidden"
              id={`upload-${storagePath}`}
            />
            <label
              htmlFor={disabled ? undefined : `upload-${storagePath}`}
              className={`clay-btn-ghost inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${
                disabled || uploading ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              {value ? "Replace photo" : "Upload photo"}
            </label>
            {value && !uploading && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            )}
            <p className="text-[11px] text-slate-400">Max {formatBytes(maxBytes)}</p>
          </div>
        </div>
      </Field>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

// ─── Step 1: About You ───────────────────────────────────────────────────────

function StepAboutYou({
  form,
  set,
  applicationId,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  applicationId: string;
}) {
  const wordCount = form.aboutText.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-4">
      <ImageUploadField
        label="Profile photo"
        icon={User}
        value={form.profilePhotoUrl}
        onChange={(url) => set("profilePhotoUrl", url)}
        storagePath={`${applicationId}/profile-photo`}
        maxBytes={MAX_PHOTO_BYTES}
      />
      <Field label="Full name" icon={User}>
        <TextInput value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your full name" />
      </Field>
      <Field label="College / Institution" icon={GraduationCap}>
        <TextInput value={form.college} onChange={(e) => set("college", e.target.value)} placeholder="e.g. AIIMS New Delhi" />
      </Field>
      <Field label="Rank / AIR" icon={Award}>
        <TextInput value={form.rank} onChange={(e) => set("rank", e.target.value)} placeholder="e.g. AIR 89" />
      </Field>
      <div>
        <Field label="About you" icon={FileText}>
          <textarea
            value={form.aboutText}
            onChange={(e) => set("aboutText", e.target.value)}
            rows={5}
            placeholder="Tell students about your journey — keep it about your prep story and how you help students, not a promotional pitch."
            className="clay-inset w-full rounded-2xl px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </Field>
        <p className={`mt-1 text-right text-xs ${wordCount > 200 ? "font-semibold text-rose-600" : "text-slate-400"}`}>
          {wordCount} / ~200 words
        </p>
      </div>
      <div>
        <Field label={`Weekly time commitment (minimum ${MIN_WEEKLY_HOURS} hours)`} icon={Clock}>
          <TextInput
            type="number"
            min={MIN_WEEKLY_HOURS}
            value={form.weeklyHours}
            onChange={(e) => set("weeklyHours", e.target.value)}
            placeholder="e.g. 6"
          />
        </Field>
        {form.weeklyHours && Number(form.weeklyHours) < MIN_WEEKLY_HOURS && (
          <p className="mt-1.5 text-xs font-medium text-rose-600">
            Must be at least {MIN_WEEKLY_HOURS} hours per week to run a batch on EDURACK.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Beyond This Batch ───────────────────────────────────────────────

function StepBeyondBatch({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <Field label="Would you also like to sell a test series?" icon={ShoppingBag}>
          <YesNoToggle value={form.wantsToSellTestSeries} onChange={(v) => set("wantsToSellTestSeries", v)} />
        </Field>
      </div>
      <div>
        <Field label="Willing to record a short video introducing EDURACK's features?" icon={Video}>
          <YesNoToggle value={form.wantsToRecordIntroVideo} onChange={(v) => set("wantsToRecordIntroVideo", v)} />
        </Field>
        {form.wantsToRecordIntroVideo && (
          <div className="mt-3">
            <TextInput
              value={form.introVideoUrl}
              onChange={(e) => set("introVideoUrl", e.target.value)}
              placeholder="Paste the video link once you've recorded it (optional for now)"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Your Batch (now with a live earnings estimate) ────────────────

function EarningsEstimate({ price }: { price: string }) {
  const perStudent = estimateEarningsPerStudent(price);
  if (perStudent === null) return null;
  return (
    <div className="clay-inset flex items-start gap-2.5 rounded-2xl bg-[var(--mint-soft)]/30 px-4 py-3">
      <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <div>
        <p className="text-sm font-semibold text-slate-800">
          You'd earn approximately ₹{perStudent.toLocaleString()} per student
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Based on ₹{Number(price).toLocaleString()} price minus EDURACK's fixed {FIXED_COMMISSION_PERCENT}%
          commission. 10 students ≈ ₹{(perStudent * 10).toLocaleString()}, 50 students ≈ ₹
          {(perStudent * 50).toLocaleString()}.
        </p>
      </div>
    </div>
  );
}

function StepYourBatch({
  form,
  set,
  applicationId,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  applicationId: string;
}) {
  return (
    <div className="space-y-4">
      <Field label="Batch name" icon={Tag}>
        <TextInput value={form.batchName} onChange={(e) => set("batchName", e.target.value)} placeholder="e.g. Organic Chemistry Mastery Batch" />
      </Field>
      <div>
        <ImageUploadField
          label="Batch thumbnail"
          icon={ImageIcon}
          value={form.batchThumbnailUrl}
          onChange={(url) => set("batchThumbnailUrl", url)}
          storagePath={`${applicationId}/batch-thumbnail`}
          maxBytes={MAX_THUMBNAIL_BYTES}
          disabled={form.needsThumbnailFromEdurack}
          shape="wide"
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={form.needsThumbnailFromEdurack}
            onChange={(e) => {
              set("needsThumbnailFromEdurack", e.target.checked);
              if (e.target.checked) set("batchThumbnailUrl", "");
            }}
            className="h-4 w-4 rounded"
          />
          I don't have one — please design a thumbnail for my batch
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Field label="Batch price (₹)" icon={IndianRupee}>
            <TextInput
              type="number"
              value={form.batchPrice}
              onChange={(e) => set("batchPrice", e.target.value)}
              placeholder="2999"
            />
          </Field>
        </div>
        <div>
          <Field label={`Duration (min. ${MIN_BATCH_DURATION_MONTHS} months)`} icon={CalendarDays}>
            <TextInput
              type="number"
              min={MIN_BATCH_DURATION_MONTHS}
              value={form.batchDurationMonths}
              onChange={(e) => set("batchDurationMonths", e.target.value)}
              placeholder="4"
            />
          </Field>
        </div>
      </div>
      {form.batchDurationMonths && Number(form.batchDurationMonths) < MIN_BATCH_DURATION_MONTHS && (
        <p className="text-xs font-medium text-rose-600">
          Batches must run for at least {MIN_BATCH_DURATION_MONTHS} months.
        </p>
      )}
      <EarningsEstimate price={form.batchPrice} />
      <div>
        <Field label="Is this batch open to everyone, or is there a minimum student criteria?" icon={Users2}>
          <YesNoToggle
            value={form.hasMinStudentCriteria}
            onChange={(v) => set("hasMinStudentCriteria", v)}
            yesLabel="Has criteria"
            noLabel="Open to all"
          />
        </Field>
        {form.hasMinStudentCriteria && (
          <div className="mt-3">
            <TextInput
              value={form.minStudentCriteriaDetails}
              onChange={(e) => set("minStudentCriteriaDetails", e.target.value)}
              placeholder="Describe the criteria (e.g. must have attempted NEET once)"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: Materials & Promotion ───────────────────────────────────────────

function StepMaterialsPromotion({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <Field label="Do you need help promoting this batch?" icon={Megaphone}>
          <YesNoToggle value={form.needsPromotionAssistance} onChange={(v) => set("needsPromotionAssistance", v)} />
        </Field>
        {form.needsPromotionAssistance && (
          <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            If EDURACK promotes your batch, an additional 10% commission is taken from each student
            purchase made through that promotion, on top of the standard {FIXED_COMMISSION_PERCENT}%.
          </div>
        )}
      </div>
      <div>
        <Field label="Do you have a syllabus / planner PDF ready?" icon={BookMarked}>
          <YesNoToggle value={form.hasSyllabusPdf} onChange={(v) => set("hasSyllabusPdf", v)} />
        </Field>
        {form.hasSyllabusPdf ? (
          <div className="mt-3">
            <TextInput
              value={form.syllabusPdfUrl}
              onChange={(e) => set("syllabusPdfUrl", e.target.value)}
              placeholder="Paste the PDF link"
            />
          </div>
        ) : (
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.wantsPlannerDiscussionCall}
              onChange={(e) => set("wantsPlannerDiscussionCall", e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Set up a quick call to plan this together
          </label>
        )}
      </div>
    </div>
  );
}

// ─── Step 5: Terms & Launch — commission is fixed, not editable ────────────

function StepTermsLaunch({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          Platform commission
        </label>
        <div className="clay-inset rounded-2xl px-4 py-4">
          <p className="font-display text-2xl font-extrabold text-slate-900">{FIXED_COMMISSION_PERCENT}%</p>
          <p className="mt-1 text-xs text-slate-500">
            EDURACK's commission rate is fixed at {FIXED_COMMISSION_PERCENT}% for every mentor — this isn't
            negotiable at onboarding, so there's nothing to enter here.
          </p>
        </div>
        <label className="mt-3 flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.commissionAgreed}
            onChange={(e) => set("commissionAgreed", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded"
          />
          I understand and agree to EDURACK's fixed {FIXED_COMMISSION_PERCENT}% commission rate.
        </label>
      </div>

      <div>
        <Field label="Would you like a quick platform walkthrough before launch?" icon={Rocket}>
          <YesNoToggle value={form.wantsPlatformTour} onChange={(v) => set("wantsPlatformTour", v)} />
        </Field>
      </div>
      <Field label="Preferred batch launch date" icon={MapPin}>
        <TextInput
          type="date"
          value={form.preferredLaunchDate}
          onChange={(e) => set("preferredLaunchDate", e.target.value)}
        />
      </Field>
    </div>
  );
}

// ─── Step 6: Review — see everything laid out together, edit any section
// before it's actually submitted ────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value || "—"}</span>
    </div>
  );
}

function ReviewSection({
  title,
  stepIndex,
  onEditStep,
  children,
}: {
  title: string;
  stepIndex: number;
  onEditStep: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="clay-inset rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
        <button
          type="button"
          onClick={() => onEditStep(stepIndex)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)] hover:underline"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function ReviewStep({ form, onEditStep }: { form: FormState; onEditStep: (step: number) => void }) {
  const perStudent = estimateEarningsPerStudent(form.batchPrice);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Review everything below before submitting. Click <strong>Edit</strong> on any section to go back
        and change it — nothing is saved until you confirm here.
      </p>

      {form.profilePhotoUrl && (
        <div className="flex items-center gap-3">
          <img src={form.profilePhotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          <p className="text-xs text-slate-500">Your uploaded profile photo</p>
        </div>
      )}

      <ReviewSection title="About You" stepIndex={ABOUT_YOU_STEP} onEditStep={onEditStep}>
        <ReviewRow label="Full name" value={form.fullName} />
        <ReviewRow label="College" value={form.college} />
        <ReviewRow label="Rank" value={form.rank} />
        <ReviewRow label="Weekly commitment" value={form.weeklyHours ? `${form.weeklyHours} hrs/week` : ""} />
      </ReviewSection>

      <ReviewSection title="Beyond This Batch" stepIndex={BEYOND_BATCH_STEP} onEditStep={onEditStep}>
        <ReviewRow label="Also sell a test series" value={form.wantsToSellTestSeries ? "Yes" : "No"} />
        <ReviewRow label="Intro video" value={form.wantsToRecordIntroVideo ? (form.introVideoUrl || "Yes, pending") : "No"} />
      </ReviewSection>

      <ReviewSection title="Your Batch" stepIndex={YOUR_BATCH_STEP} onEditStep={onEditStep}>
        <ReviewRow label="Batch name" value={form.batchName} />
        <ReviewRow label="Thumbnail" value={form.needsThumbnailFromEdurack ? "Requested from EDURACK" : form.batchThumbnailUrl ? "Uploaded" : "Not set"} />
        <ReviewRow label="Price" value={form.batchPrice ? `₹${Number(form.batchPrice).toLocaleString()}` : ""} />
        <ReviewRow label="Duration" value={form.batchDurationMonths ? `${form.batchDurationMonths} months` : ""} />
        <ReviewRow
          label="Enrollment"
          value={form.hasMinStudentCriteria ? form.minStudentCriteriaDetails || "Has criteria" : "Open to all"}
        />
        {perStudent !== null && (
          <ReviewRow label="Est. earning / student" value={`₹${perStudent.toLocaleString()}`} />
        )}
      </ReviewSection>

      <ReviewSection title="Materials & Promotion" stepIndex={MATERIALS_STEP} onEditStep={onEditStep}>
        <ReviewRow label="Needs promotion help" value={form.needsPromotionAssistance ? "Yes" : "No"} />
        <ReviewRow
          label="Syllabus/planner"
          value={form.hasSyllabusPdf ? form.syllabusPdfUrl : form.wantsPlannerDiscussionCall ? "Wants a planning call" : "Not provided"}
        />
      </ReviewSection>

      <ReviewSection title="Terms & Launch" stepIndex={TERMS_STEP} onEditStep={onEditStep}>
        <ReviewRow label="Commission" value={`${FIXED_COMMISSION_PERCENT}% (agreed)`} />
        <ReviewRow label="Wants platform tour" value={form.wantsPlatformTour ? "Yes" : "No"} />
        <ReviewRow label="Preferred launch date" value={form.preferredLaunchDate} />
      </ReviewSection>
    </div>
  );
}

// ─── Agreement (external link) + confirmation ───────────────────────────────
const AGREEMENT_VERSION = "v2-2026-08";

// TODO: paste the actual agreement document link here once it's drafted
// (Google Doc, PDF, DocuSign, whatever you land on). Left empty on purpose
// — the wizard shows a "not ready yet" message instead of a dead link
// until this is filled in.
const AGREEMENT_LINK = "";

function AgreementStep({
  applicationId,
  fullName,
  onBack,
  onSigned,
}: {
  applicationId: string;
  fullName: string;
  onBack: () => void;
  onSigned: () => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSign() {
    setError(null);
    if (!agreed) return setError("Check the box confirming you've read the agreement.");
    if (!typedName.trim()) return setError("Type your full legal name to confirm.");

    setSigning(true);
    try {
      await signMentorAgreement({
        data: { applicationId, typedFullName: typedName, agreementUrl: AGREEMENT_LINK, agreementVersion: AGREEMENT_VERSION },
      });
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm. Try again.");
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="clay-inset rounded-2xl p-4">
        <p className="mb-3 text-sm text-slate-700">
          Please read the EDURACK Mentor Agreement before confirming below.
        </p>
        {AGREEMENT_LINK ? (
          <a
            href={AGREEMENT_LINK}
            target="_blank"
            rel="noreferrer"
            className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          >
            <Link2 className="h-3.5 w-3.5" />
            Open the Mentor Agreement
          </a>
        ) : (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            Agreement link isn't set up yet — reach out to the EDURACK team before continuing.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded"
        />
        I have read and agree to the Mentor Agreement linked above.
      </label>

      <Field label="Type your full legal name to confirm" icon={PenLine}>
        <TextInput
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={fullName || "Your full legal name"}
        />
      </Field>

      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="clay-btn-ghost flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Review
        </button>
        <button
          type="button"
          onClick={handleSign}
          disabled={signing}
          className="clay-btn flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold disabled:opacity-70"
        >
          {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Confirm Agreement
        </button>
      </div>
    </div>
  );
}