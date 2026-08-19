import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  GraduationCap,
  User,
  Mail,
  Phone,
  MapPin,
  Award,
  BookOpen,
  Users,
  Tag,
  IndianRupee,
  Loader2,
  CheckCircle2,
  Sparkles,
  Link2,
  Youtube,
  Instagram,
  Linkedin,
  Twitter,
  Send,
  Plus,
  Trash2,
  Check,
  BookMarked,
} from "lucide-react";
import { EXAM_KEYS, EXAM_LABELS, type ExamKey } from "@/lib/admin-types";
import { submitCreatorApplication } from "@/server-functions/mentor-applications";

export const Route = createFileRoute("/join-mentor")({
  component: JoinMentorPage,
});

// ---------------------------------------------
// Types
// ---------------------------------------------

type StudentCategory = "Droppers" | "12th" | "11th";
type SocialPlatform = "YouTube" | "Instagram" | "LinkedIn" | "X (Twitter)" | "Telegram" | "Other";

interface SocialLinkField {
  platform: SocialPlatform;
  url: string;
}

interface CreatorApplicationForm {
  fullName: string;
  email: string;
  mobileNumber: string;
  city: string;
  institution: string;
  yearOfStudy: string;
  examRank: string;
  examsTaught: ExamKey[];
  batchTitle: string;
  targetCategory: StudentCategory | "";
  pricingTier: string;
  socialLinks: SocialLinkField[];
}

const initialFormState: CreatorApplicationForm = {
  fullName: "",
  email: "",
  mobileNumber: "",
  city: "",
  institution: "",
  yearOfStudy: "",
  examRank: "",
  examsTaught: [],
  batchTitle: "",
  targetCategory: "",
  pricingTier: "",
  socialLinks: [{ platform: "YouTube", url: "" }],
};

const categories: StudentCategory[] = ["Droppers", "12th", "11th"];
const socialPlatforms: SocialPlatform[] = ["YouTube", "Instagram", "LinkedIn", "X (Twitter)", "Telegram", "Other"];
const examOptions: { key: ExamKey; label: string }[] = EXAM_KEYS.map((key) => ({ key, label: EXAM_LABELS[key] }));
const MAX_SOCIAL_LINKS = 5;

function platformIcon(platform: SocialPlatform) {
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
      return Send;
    default:
      return Link2;
  }
}

// A permissive check — good enough to catch "obviously not a link" without
// rejecting handles or domains typed without a scheme.
function looksLikeLink(value: string) {
  return /^(https?:\/\/)?[\w-]+\.[a-z]{2,}(\/\S*)?$/i.test(value.trim());
}

// ---------------------------------------------
// Page
// ---------------------------------------------

function JoinMentorPage() {
  const [form, setForm] = useState<CreatorApplicationForm>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreatorApplicationForm, string>>>({});
  const [socialErrors, setSocialErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateField<K extends keyof CreatorApplicationForm>(field: K, value: CreatorApplicationForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function toggleExam(exam: ExamKey) {
    setForm((prev) => ({
      ...prev,
      examsTaught: prev.examsTaught.includes(exam)
        ? prev.examsTaught.filter((e) => e !== exam)
        : [...prev.examsTaught, exam],
    }));
    if (errors.examsTaught) {
      setErrors((prev) => ({ ...prev, examsTaught: undefined }));
    }
  }

  function updateSocialLink(index: number, patch: Partial<SocialLinkField>) {
    setForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));
    if (socialErrors[index]) {
      setSocialErrors((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  }

  function addSocialLink() {
    if (form.socialLinks.length >= MAX_SOCIAL_LINKS) return;
    setForm((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, { platform: "Instagram", url: "" }] }));
  }

  function removeSocialLink(index: number) {
    setForm((prev) => ({ ...prev, socialLinks: prev.socialLinks.filter((_, i) => i !== index) }));
    setSocialErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof CreatorApplicationForm, string>> = {};

    if (!form.fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = "Enter a valid email.";
    if (!/^\d{10}$/.test(form.mobileNumber)) nextErrors.mobileNumber = "Enter a valid 10-digit mobile number.";
    if (!form.city.trim()) nextErrors.city = "City is required.";
    if (!form.institution.trim()) nextErrors.institution = "Institution is required.";
    if (!form.yearOfStudy.trim()) nextErrors.yearOfStudy = "Year of study is required.";
    if (!form.examRank.trim()) nextErrors.examRank = "Exam rank / AIR is required.";
    if (form.examsTaught.length === 0)
      nextErrors.examsTaught = "Select at least one exam you'd like to mentor for." as unknown as undefined;
    if (!form.batchTitle.trim()) nextErrors.batchTitle = "Batch title is required.";
    if (!form.targetCategory) nextErrors.targetCategory = "Select a target category.";
    if (!form.pricingTier.trim()) nextErrors.pricingTier = "Pricing tier is required.";

    // Social links are optional overall, but any row with text typed in
    // should look like an actual link, not a stray character.
    const nextSocialErrors: Record<number, string> = {};
    form.socialLinks.forEach((link, i) => {
      const trimmed = link.url.trim();
      if (trimmed && !looksLikeLink(trimmed)) {
        nextSocialErrors[i] = "Doesn't look like a valid link.";
      }
    });

    setErrors(nextErrors);
    setSocialErrors(nextSocialErrors);
    return Object.keys(nextErrors).length === 0 && Object.keys(nextSocialErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await submitCreatorApplication({
        data: {
          fullName: form.fullName,
          email: form.email,
          mobileNumber: form.mobileNumber,
          city: form.city,
          institution: form.institution,
          yearOfStudy: form.yearOfStudy,
          examRank: form.examRank,
          examsTaught: form.examsTaught,
          batchTitle: form.batchTitle,
          targetCategory: form.targetCategory as StudentCategory,
          pricingTier: form.pricingTier,
          socialLinks: form.socialLinks,
        },
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SuccessState
        onReset={() => {
          setForm(initialFormState);
          setSubmitted(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-3xl">
        <BrandHeader />

        <div className="mt-8 text-center">
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 sm:text-sm">
            <Sparkles className="h-4 w-4" />
            Creator Application
          </div>
          <h1 className="fluid-h2 mt-4 font-display font-extrabold tracking-tight text-slate-900">
            Join EDURACK as a Mentor
          </h1>
          <p className="fluid-body mx-auto mt-3 max-w-xl text-slate-600">
            Tell us about your background and the batch you'd like to run — for NEET, JEE, CUET, or
            IPMAT. Our team reviews every application before your mentor space goes live.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="clay mt-10 p-6 sm:p-10">
          <FormSection icon={User} title="Personal Details" subtitle="How students and our team can reach you.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Full Name"
                icon={User}
                value={form.fullName}
                onChange={(v) => updateField("fullName", v)}
                placeholder="e.g. Rahul Jha"
                error={errors.fullName}
              />
              <TextField
                label="Email"
                icon={Mail}
                type="email"
                value={form.email}
                onChange={(v) => updateField("email", v)}
                placeholder="you@example.com"
                error={errors.email}
              />
              <TextField
                label="Mobile Number"
                icon={Phone}
                type="tel"
                value={form.mobileNumber}
                onChange={(v) => updateField("mobileNumber", v.replace(/[^\d]/g, "").slice(0, 10))}
                placeholder="10-digit number"
                error={errors.mobileNumber}
              />
              <TextField
                label="City"
                icon={MapPin}
                value={form.city}
                onChange={(v) => updateField("city", v)}
                placeholder="e.g. Ambarnath"
                error={errors.city}
              />
            </div>
          </FormSection>

          <Divider />

          <FormSection
            icon={GraduationCap}
            title="Academic Credentials"
            subtitle="The credentials that build student trust in your batch."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Elite College / Institution"
                icon={GraduationCap}
                value={form.institution}
                onChange={(v) => updateField("institution", v)}
                placeholder="e.g. AIIMS New Delhi"
                error={errors.institution}
                fullWidth
              />
              <TextField
                label="Year of Study"
                icon={BookOpen}
                value={form.yearOfStudy}
                onChange={(v) => updateField("yearOfStudy", v)}
                placeholder="e.g. 2nd Year MBBS"
                error={errors.yearOfStudy}
              />
              <TextField
                label="Exam Rank / AIR"
                icon={Award}
                value={form.examRank}
                onChange={(v) => updateField("examRank", v)}
                placeholder="e.g. AIR 89"
                error={errors.examRank}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Which exam(s) would you like to mentor for?
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {examOptions.map((exam) => {
                  const active = form.examsTaught.includes(exam.key);
                  return (
                    <button
                      key={exam.key}
                      type="button"
                      onClick={() => toggleExam(exam.key)}
                      className={`flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 ${
                        active
                          ? "clay-btn text-white"
                          : "clay-inset text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {exam.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Select all that apply.</p>
              {errors.examsTaught && (
                <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.examsTaught}</p>
              )}
            </div>
          </FormSection>

          <Divider />

          <FormSection
            icon={Users}
            title="Mentorship Intentions"
            subtitle="What your mentorship batch will look like on EDURACK."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Expected Batch Title"
                icon={Tag}
                value={form.batchTitle}
                onChange={(v) => updateField("batchTitle", v)}
                placeholder="e.g. Organic Chemistry Mastery Batch"
                error={errors.batchTitle}
                fullWidth
              />

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Target Student Category</label>
                <div className="clay-inset flex gap-1 p-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => updateField("targetCategory", cat)}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                        form.targetCategory === cat
                          ? "clay-btn text-white"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {errors.targetCategory && (
                  <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.targetCategory}</p>
                )}
              </div>

              <TextField
                label="Settled Target Pricing Tier"
                icon={IndianRupee}
                value={form.pricingTier}
                onChange={(v) => updateField("pricingTier", v)}
                placeholder="e.g. ₹2,999 / month"
                error={errors.pricingTier}
              />
            </div>
          </FormSection>

          <Divider />

          <FormSection
            icon={Link2}
            title="Online Presence"
            subtitle="Where students can already find your content — optional, but it speeds up review."
          >
            <div className="space-y-3">
              {form.socialLinks.map((link, index) => {
                const Icon = platformIcon(link.platform);
                return (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="relative sm:w-40 sm:shrink-0">
                      <select
                        value={link.platform}
                        onChange={(e) => updateSocialLink(index, { platform: e.target.value as SocialPlatform })}
                        className="clay-inset w-full appearance-none rounded-2xl px-4 py-3 pr-9 text-sm text-slate-900 focus:outline-none"
                      >
                        {socialPlatforms.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1">
                      <div className="clay-inset flex items-center gap-2.5 px-4 py-3">
                        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                          type="text"
                          value={link.url}
                          onChange={(e) => updateSocialLink(index, { url: e.target.value })}
                          placeholder={
                            link.platform === "YouTube"
                              ? "youtube.com/@yourchannel"
                              : link.platform === "Instagram"
                                ? "instagram.com/yourhandle"
                                : link.platform === "LinkedIn"
                                  ? "linkedin.com/in/yourname"
                                  : link.platform === "Telegram"
                                    ? "t.me/yourchannel"
                                    : "https://…"
                          }
                          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        />
                        {form.socialLinks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSocialLink(index)}
                            aria-label="Remove link"
                            className="shrink-0 text-slate-300 transition-colors duration-200 hover:text-rose-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {socialErrors[index] && (
                        <p className="mt-1.5 text-xs font-medium text-rose-600">{socialErrors[index]}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {form.socialLinks.length < MAX_SOCIAL_LINKS && (
                <button
                  type="button"
                  onClick={addSocialLink}
                  className="clay-btn-ghost inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another link
                </button>
              )}
            </div>
          </FormSection>

          {submitError && (
            <p className="mt-6 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{submitError}</p>
          )}

          <div className="mt-8 flex flex-col items-center gap-3 border-t border-slate-200/70 pt-6 sm:flex-row sm:justify-between">
            <p className="text-xs text-slate-500 sm:max-w-xs">
              By submitting, you agree to EDURACK's{" "}
              <Link to="/legal/terms" className="font-semibold text-slate-700 hover:underline">
                mentor guidelines
              </Link>{" "}
              and revenue-share terms.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="clay-btn inline-flex w-full items-center justify-center gap-2 px-8 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Submitting Application...
                </>
              ) : (
                "Submit Application"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------
// Sub-components
// ---------------------------------------------

function BrandHeader() {
  return (
    <Link to="/" className="flex items-center justify-center gap-3">
      <img
        src="https://i.postimg.cc/4NvD69v0/image-removebg-preview.png"
        alt="EDURACK"
        className="h-10 w-auto shrink-0 object-contain sm:h-12"
      />
      <span className="font-display text-xl font-bold tracking-tight text-slate-900">EDURACK</span>
    </Link>
  );
}

function FormSection({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100">
          <Icon className="h-5 w-5 text-sky-600" />
        </div>
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
          <p className="text-xs text-slate-500 sm:text-sm">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="my-8 h-px bg-slate-200/70" />;
}

function TextField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  fullWidth = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      <div className="clay-inset flex items-center gap-2.5 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

function SuccessState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="clay mx-auto max-w-md p-10 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal-100">
          <CheckCircle2 className="h-8 w-8 text-teal-600" />
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-slate-900">Application Received</h2>
        <p className="mt-2 text-sm text-slate-600">
          Thanks for applying to mentor on EDURACK. Our team will review your details and get back
          to you at the email you provided.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <button onClick={onReset} className="clay-btn-ghost px-6 py-3 text-sm font-semibold">
            Submit Another Application
          </button>
          <Link to="/" className="clay-btn px-6 py-3 text-sm font-semibold">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}