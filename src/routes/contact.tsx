import { createFileRoute, Link } from "@tanstack/react-router";
import { requestStudentCallback } from "@/server-functions/callback-requests";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  User,
  Phone,
  School,
  MessageCircleQuestion,
  PhoneCall,
  Loader2,
  CheckCircle2,
  Clock3,
} from "lucide-react";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
});

// Shared with the main site header/footer — keep in sync if the asset moves.
const LOGO_SRC = "/assets/branding/edurack-logo.png";

// ---------------------------------------------
// Types
// ---------------------------------------------

type ExamTrack = "NEET" | "JEE" | "Dual Track";

type DiscussionTopic =
  | "Query about Mentor Batches"
  | "CBT Test Series Features"
  | "General Support";

interface CallbackForm {
  studentName: string;
  mobileNumber: string;
  examTrack: ExamTrack | "";
  academicClass: string;
  discussionTopic: DiscussionTopic | "";
}

const initialFormState: CallbackForm = {
  studentName: "",
  mobileNumber: "",
  examTrack: "",
  academicClass: "",
  discussionTopic: "",
};

const examTracks: ExamTrack[] = ["NEET", "JEE", "Dual Track"];

const discussionTopics: DiscussionTopic[] = [
  "Query about Mentor Batches",
  "CBT Test Series Features",
  "General Support",
];

// ---------------------------------------------
// Page
// ---------------------------------------------

function ContactPage() {
  const [form, setForm] = useState<CallbackForm>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CallbackForm, string>>>({});

  function updateField<K extends keyof CallbackForm>(field: K, value: CallbackForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof CallbackForm, string>> = {};

    if (!form.studentName.trim()) nextErrors.studentName = "Please enter your name.";
    if (!/^\d{10}$/.test(form.mobileNumber)) nextErrors.mobileNumber = "Enter a valid 10-digit number.";
    if (!form.examTrack) nextErrors.examTrack = "Select your target exam track.";
    if (!form.academicClass.trim()) nextErrors.academicClass = "Enter your current class.";
    if (!form.discussionTopic) nextErrors.discussionTopic = "Select a topic.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

    async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);

    try {
      await requestStudentCallback({
        data: {
          studentName: form.studentName,
          mobileNumber: form.mobileNumber,
          examTrack: form.examTrack as ExamTrack,
          academicClass: form.academicClass,
          discussionTopic: form.discussionTopic as DiscussionTopic,
        },
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit callback request", err);
      setErrors({ studentName: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }
  
  if (submitted) {
    return <SuccessState onReset={() => { setForm(initialFormState); setSubmitted(false); }} />;
  }

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-2xl">
        <BrandHeader />

        <div className="mt-8 text-center">
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sky-700 sm:text-sm">
            <PhoneCall className="h-4 w-4" />
            Talk to EDURACK
          </div>
          <h1 className="fluid-h2 mt-4 font-display font-extrabold tracking-tight text-slate-900">
            Request a Call Back
          </h1>
          <p className="fluid-body mx-auto mt-3 max-w-md text-slate-600">
            Share a few details and our team will connect with you directly to
            answer your questions.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="clay mt-8 p-6 sm:p-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Student Name"
              icon={User}
              value={form.studentName}
              onChange={(v) => updateField("studentName", v)}
              placeholder="e.g. Priya Sharma"
              error={errors.studentName}
              fullWidth
            />

            <TextField
              label="WhatsApp / Mobile Number"
              icon={Phone}
              type="tel"
              value={form.mobileNumber}
              onChange={(v) => updateField("mobileNumber", v.replace(/[^\d]/g, "").slice(0, 10))}
              placeholder="10-digit number"
              error={errors.mobileNumber}
              fullWidth
            />

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Target Exam Track
              </label>
              <div className="clay-inset flex gap-1 p-1">
                {examTracks.map((track) => (
                  <button
                    key={track}
                    type="button"
                    onClick={() => updateField("examTrack", track)}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      form.examTrack === track
                        ? "clay-btn text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {track}
                  </button>
                ))}
              </div>
              {errors.examTrack && (
                <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.examTrack}</p>
              )}
            </div>

            <TextField
              label="Current Academic Class"
              icon={School}
              value={form.academicClass}
              onChange={(v) => updateField("academicClass", v)}
              placeholder="e.g. 12th / Dropper"
              error={errors.academicClass}
            />

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                What would you like to discuss?
              </label>
              <div className="clay-inset flex items-center gap-2.5 px-4 py-3">
                <MessageCircleQuestion className="h-4 w-4 shrink-0 text-slate-400" />
                <select
                  value={form.discussionTopic}
                  onChange={(e) => updateField("discussionTopic", e.target.value as DiscussionTopic)}
                  className="w-full appearance-none bg-transparent text-sm text-slate-900 outline-none"
                >
                  <option value="" disabled>
                    Select a topic
                  </option>
                  {discussionTopics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </div>
              {errors.discussionTopic && (
                <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.discussionTopic}</p>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200/70 pt-6">
            <button
              type="submit"
              disabled={submitting}
              className="clay-btn inline-flex w-full items-center justify-center gap-2 px-8 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Requesting Call Back...
                </>
              ) : (
                <>
                  <span>Request Call Back</span>
                  <PhoneCall className="h-5 w-5" />
                </>
              )}
            </button>
            <p className="mt-3.5 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-slate-500">
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-teal-600" />
              Our team will reach out to you within 2-4 hours via call or WhatsApp.
            </p>
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
      {/* Platform logo — resized dynamically to keep proportions clean */}
      <img
        src="https://i.postimg.cc/4NvD69v0/image-removebg-preview.png"
        alt="EDURACK"
        className="h-10 w-auto shrink-0 object-contain sm:h-12"
      />
      <span className="font-display text-xl font-bold tracking-tight text-slate-900">
        EDURACK
      </span>
    </Link>
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
        <h2 className="mt-5 font-display text-xl font-bold text-slate-900">
          Request Received
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Thanks for reaching out. Our team will call or WhatsApp you within
          2-4 hours to help with your query.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <button onClick={onReset} className="clay-btn-ghost px-6 py-3 text-sm font-semibold">
            Request Another Call Back
          </button>
          <Link to="/" className="clay-btn px-6 py-3 text-sm font-semibold">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}