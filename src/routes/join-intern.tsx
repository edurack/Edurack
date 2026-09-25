import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  IconSparkles as Sparkles,
  IconUser as User,
  IconMail as Mail,
  IconPhone as Phone,
  IconFileText as FileText,
  IconLink as LinkIcon,
  IconUpload as Upload,
  IconLoader2 as Loader2,
  IconCircleCheck as CheckCircle2,
  IconClipboardCheck as ClipboardCheck,
  IconFlask as Flask,
  IconBriefcase as Briefcase,
  IconCertificate as Certificate,
  IconArrowRight as ArrowRight,
  IconX as X,
} from "@tabler/icons-react";
import { submitInternApplication } from "@/server-functions/intern-applications";
import { uploadInternApplicationFile, formatBytes } from "@/lib/intern-application-upload";
import { MAX_INTERN_APPLICATION_FILE_BYTES } from "@/lib/supabase";
import { SiteHeader, SiteFooter, WRAP, INK, Rise } from "@/components/landing/site-chrome";

export const Route = createFileRoute("/join-intern")({
  component: JoinInternPage,
});

// ---------------------------------------------
// The process below mirrors the actual pipeline this codebase implements
// (see src/lib/intern-types.ts, src/server-functions/intern-trial.ts and
// intern-auth.ts):
//   1. Candidate applies here → lands in `internApplications` (this file).
//   2. Admin reviews and sends a short, sandboxed sample task — a
//      single-use link, no account needed (TrialAssignment).
//   3. Admin scores the submission and decides advance/reject.
//   4. If advanced, admin issues a real intern account (invite code the
//      candidate claims by picking a username + password).
//   5. The intern gets assigned real tasks, drafts questions, and an
//      admin reviews each one (approved/rejected) before it goes live.
//   6. Offer letter is issued once the internship starts, and a
//      certificate unlocks once it's complete.
// ---------------------------------------------
const processSteps = [
  {
    icon: ClipboardCheck,
    title: "Apply",
    description: "Fill out the short form below with your name, email, and a bit about your experience.",
  },
  {
    icon: Flask,
    title: "Sample Task",
    description:
      "If your profile looks like a fit, we'll email you a small, sandboxed sample task — no account needed, just a one-time link.",
  },
  {
    icon: CheckCircle2,
    title: "Review",
    description: "Our team scores your submission and decides whether to move you forward — you'll hear back either way.",
  },
  {
    icon: Briefcase,
    title: "Onboarding",
    description:
      "Selected candidates get a real intern account and their first task, with a set start and end date for the internship.",
  },
  {
    icon: Certificate,
    title: "Offer Letter & Certificate",
    description:
      "Your offer letter is issued once you start. Complete your internship and your certificate unlocks for download.",
  },
];

// ---------------------------------------------
// Form
// ---------------------------------------------

type InternApplicationForm = {
  fullName: string;
  email: string;
  phone: string;
  experience: string;
  portfolioUrl: string;
};

const initialFormState: InternApplicationForm = {
  fullName: "",
  email: "",
  phone: "",
  experience: "",
  portfolioUrl: "",
};

function looksLikeLink(value: string) {
  return /^(https?:\/\/)?[\w-]+\.[a-z]{2,}(\/\S*)?$/i.test(value.trim());
}

function JoinInternPage() {
  const [form, setForm] = useState<InternApplicationForm>(initialFormState);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof InternApplicationForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function updateField<K extends keyof InternApplicationForm>(field: K, value: InternApplicationForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    setResumeFile(file);
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof InternApplicationForm, string>> = {};
    if (!form.fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = "Enter a valid email.";
    if (!form.experience.trim()) nextErrors.experience = "Tell us a bit about your experience.";
    if (form.portfolioUrl.trim() && !looksLikeLink(form.portfolioUrl)) {
      nextErrors.portfolioUrl = "Doesn't look like a valid link.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      let resumeUrl: string | null = null;
      if (resumeFile) {
        try {
          resumeUrl = await uploadInternApplicationFile(resumeFile);
        } catch (err) {
          setFileError(err instanceof Error ? err.message : "Resume upload failed.");
          setSubmitting(false);
          return;
        }
      }

      await submitInternApplication({
        data: {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          experience: form.experience,
          resumeUrl,
          portfolioUrl: form.portfolioUrl.trim() || null,
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
          setResumeFile(null);
          setSubmitted(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* Hero — same light/bold headline pairing + scroll-reveal as the homepage */}
        <section className="py-14 sm:py-20">
          <div className={WRAP}>
            <Rise className="mx-auto max-w-2xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary sm:text-sm">
                <Sparkles className="h-4 w-4" />
                Internship Program
              </div>
              <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
                <span className="block font-light">Intern</span>
                <span className="block font-extrabold">at EDURACK.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Help build the question bank NEET, JEE, CUET, and IPMAT aspirants prep from. Apply below
                — it takes two minutes, and a resume or portfolio link is optional.
              </p>
            </Rise>
          </div>
        </section>

        {/* What the internship gives back — same ink banner pattern as the homepage careers strip */}
        <section className={`${INK} py-16 sm:py-20`}>
          <div className={WRAP}>
            <Rise>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-semibold text-[#7ba4f0]">
                <Briefcase className="h-4 w-4" /> Why intern with us
              </p>
              <h2 className="mt-5 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
                <span className="block font-light">Real work,</span>
                <span className="block font-extrabold">real proof you did it.</span>
              </h2>
            </Rise>
            <Rise
              delay={0.1}
              className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/15 bg-white/15 sm:grid-cols-2"
            >
              {[
                ["Fully remote", "Flexible hours"],
                ["Real tasks", "Reviewed by our team"],
                ["Offer letter", "Once you start"],
                ["Certificate", "Once you complete it"],
              ].map(([a, b]) => (
                <div key={a} className="bg-[#141b2b] p-5">
                  <p className="font-display font-bold">{a}</p>
                  <p className="mt-1 text-sm text-white/50">{b}</p>
                </div>
              ))}
            </Rise>
          </div>
        </section>

        {/* Process steps + application form */}
        <section className="py-16 sm:py-20">
          <div className={WRAP}>
            <Rise className="mx-auto max-w-3xl">
              <ProcessSteps />
            </Rise>

            <Rise delay={0.1} className="mx-auto max-w-3xl">
              <form onSubmit={handleSubmit} noValidate className="clay mt-10 p-6 sm:p-10">
          <FormSection icon={User} title="Your Details" subtitle="Just the basics — no account needed to apply.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Full Name"
                icon={User}
                value={form.fullName}
                onChange={(v) => updateField("fullName", v)}
                placeholder="e.g. Priya Sharma"
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
                label="Phone (optional)"
                icon={Phone}
                type="tel"
                value={form.phone}
                onChange={(v) => updateField("phone", v.replace(/[^\d]/g, "").slice(0, 10))}
                placeholder="10-digit number"
              />
              <TextField
                label="Portfolio / LinkedIn (optional)"
                icon={LinkIcon}
                value={form.portfolioUrl}
                onChange={(v) => updateField("portfolioUrl", v)}
                placeholder="https://..."
                error={errors.portfolioUrl}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Experience
                <span className="ml-1 font-normal text-muted-foreground">
                  — subjects you're strong in, past teaching/content work, anything relevant
                </span>
              </label>
              <textarea
                value={form.experience}
                onChange={(e) => updateField("experience", e.target.value)}
                placeholder="e.g. 2nd year B.Sc Physics, have written practice questions for a coaching institute, strong in Mechanics and Modern Physics..."
                rows={4}
                className="clay-inset w-full resize-none px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {errors.experience && <p className="mt-1.5 text-xs font-medium text-destructive">{errors.experience}</p>}
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Resume / Portfolio Upload
                <span className="ml-1 font-normal text-muted-foreground">(optional, PDF or Word, max {formatBytes(MAX_INTERN_APPLICATION_FILE_BYTES)})</span>
              </label>
              {resumeFile ? (
                <div className="clay-inset flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm text-foreground">{resumeFile.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(resumeFile.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResumeFile(null)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="clay-inset flex cursor-pointer items-center justify-center gap-2.5 px-4 py-6 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  <Upload className="h-4 w-4" />
                  Click to upload a file
                  <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" />
                </label>
              )}
              {fileError && <p className="mt-1.5 text-xs font-medium text-destructive">{fileError}</p>}
            </div>
          </FormSection>

          {submitError && (
            <p className="mt-6 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {submitError}
            </p>
          )}

          <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground sm:max-w-xs">
              By applying, you agree to be contacted by EDURACK about this internship.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="clay-btn inline-flex w-full items-center justify-center gap-2 px-8 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Application"
              )}
                </button>
              </div>
            </form>
            </Rise>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

// ---------------------------------------------
// Sub-components
// ---------------------------------------------

function ProcessSteps() {
  return (
    <section className="clay mt-8 p-6 sm:p-10">
      <div className="text-center">
        <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-primary">
          <ArrowRight className="h-3.5 w-3.5" />
          How It Works
        </div>
        <h2 className="mt-3 font-display text-lg font-bold text-foreground sm:text-xl">
          From application to certificate
        </h2>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {processSteps.map((step, i) => (
          <div key={step.title} className="flex gap-4 sm:gap-5">
            <div className="flex flex-col items-center">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent">
                <step.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              {i < processSteps.length - 1 && <div className="mt-2 w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className="clay-inset flex-1 p-5">
              <h3 className="font-display text-sm font-bold text-foreground">
                Step {i + 1}: {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
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
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
        <div>
          <h2 className="font-display text-base font-bold text-foreground sm:text-lg">{title}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TextField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-foreground">{label}</label>
      <div className="clay-inset flex items-center gap-2.5 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function SuccessState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Rise className="clay mx-auto max-w-md p-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent">
            <CheckCircle2 className="h-8 w-8 text-accent-foreground" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold text-foreground">Application Received</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thanks for applying to intern at EDURACK. If your profile looks like a fit, we'll email you
            a short sample task as the next step.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <button onClick={onReset} className="clay-btn-ghost px-6 py-3 text-sm font-semibold">
              Submit Another Application
            </button>
            <Link to="/" className="clay-btn px-6 py-3 text-sm font-semibold">
              Back to Home
            </Link>
          </div>
        </Rise>
      </main>
      <SiteFooter />
    </div>
  );
}