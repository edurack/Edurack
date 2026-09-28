// src/components/blog/blog-callback-section.tsx
//
// "Request a call back" block shown at the very end of every blog page. Same
// leads pipeline as /contact (they land in the admin dashboard's callback
// list) but a shorter form — four fields, exam pre-selected from the post the
// reader is on, so it takes about ten seconds to fill in.
import { useState } from "react";
import type { FormEvent } from "react";
import {
  IconPhoneCall as PhoneCall,
  IconLoader2 as Loader2,
  IconCircleCheckFilled as CheckFilled,
  IconArrowRight as ArrowRight,
  IconTargetArrow as Target,
  IconUsersGroup as Mentors,
  IconShieldCheck as Shield,
} from "@tabler/icons-react";
import { requestBlogCallback } from "@/server-functions/blog-public";
import { resolveBlogPromoAudience } from "@/lib/blog-types";

const EXAMS = ["NEET", "JEE", "CUET", "IPMAT", "Dual Track"] as const;
const CLASSES = ["11th", "12th", "Dropper", "Other"] as const;

type Exam = (typeof EXAMS)[number];
type Cls = (typeof CLASSES)[number];

function defaultExam(examKey?: string | null, category?: string | null): Exam | "" {
  const a = resolveBlogPromoAudience({ examKey, category });
  if (a === "jee") return "JEE";
  if (a === "neet") return "NEET";
  if (examKey === "cuet" || category === "cuetStrategy") return "CUET";
  if (examKey === "ipmat" || category === "ipmatStrategy") return "IPMAT";
  return "";
}

function headline(exam: Exam | ""): string {
  if (exam === "JEE" || exam === "NEET" || exam === "CUET" || exam === "IPMAT") {
    return `Confused about your ${exam} preparation?`;
  }
  return "Not sure where to start with your exam prep?";
}

export function BlogCallbackSection({
  examKey,
  category,
  postSlug,
  className,
}: {
  examKey?: string | null;
  category?: string | null;
  postSlug?: string;
  className?: string;
}) {
  const preset = defaultExam(examKey, category);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [exam, setExam] = useState<Exam | "">(preset);
  const [cls, setCls] = useState<Cls | "">("");
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Please enter your name.";
    if (!/^[6-9]\d{9}$/.test(mobile)) e.mobile = "Enter a valid 10-digit mobile number.";
    if (!exam) e.exam = "Pick your target exam.";
    if (!cls) e.cls = "Pick your current class.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await requestBlogCallback({
        data: { studentName: name, mobileNumber: mobile, examTrack: exam, academicClass: cls, postSlug, website },
      });
      setDone(true);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const fieldBase =
    "w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-[#2864d7] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2864d7]/15";

  return (
    <section
      aria-labelledby="blog-callback-heading"
      className={`relative isolate overflow-hidden rounded-[2rem] bg-[#141b2b] text-white ${className ?? ""}`}
    >
      {/* decorative glow + dot grid */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-[#2864d7]/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-0 -z-10 h-80 w-80 rounded-full bg-[#2864d7]/25 blur-3xl" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />

      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12 lg:p-14">
        {/* pitch */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90">
            <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
            Free call back from the Edurack team
          </span>
          <h2 id="blog-callback-heading" className="mt-5 font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl">
            {headline(exam)}
            <span className="block text-[#8fb3ff]">Let's talk it through.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">
            Leave your number and someone from our team will call you back to answer your questions and help you choose the right
            tests and mentors.
          </p>

          <ul className="mt-7 space-y-4">
            {[
              { Icon: Target, text: "Get the right test series for your exam and stage" },
              { Icon: Mentors, text: "Know which mentor batch actually fits you" },
              { Icon: Shield, text: "No cost, no obligation — your number is used only for this call" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/85">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#8fb3ff]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="pt-1 leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* form card — fixed light colours on purpose, so it reads the same in light and dark theme */}
        <div className="rounded-3xl bg-white p-6 text-slate-900 shadow-2xl shadow-black/30 sm:p-8">
          {done ? (
            <div className="py-8 text-center" role="status" aria-live="polite">
              <CheckFilled className="mx-auto h-14 w-14 text-emerald-500" aria-hidden="true" />
              <p className="mt-4 font-display text-2xl font-extrabold tracking-tight">Request received!</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
                Thanks{name.trim() ? `, ${name.trim().split(" ")[0]}` : ""}. Our team will call you on{" "}
                <span className="font-semibold text-slate-900">+91 {mobile}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <p className="font-display text-xl font-extrabold tracking-tight">Request a call back</p>
              <p className="mt-1 text-sm text-slate-500">Takes about 10 seconds.</p>

              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="cb-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Your name
                  </label>
                  <input
                    id="cb-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="e.g. Priya Sharma"
                    aria-invalid={Boolean(errors.name)}
                    className={`${fieldBase} ${errors.name ? "border-rose-400" : "border-slate-200"}`}
                  />
                  {errors.name && <p className="mt-1 text-xs font-medium text-rose-600">{errors.name}</p>}
                </div>

                <div>
                  <label htmlFor="cb-mobile" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Mobile number
                  </label>
                  <div className="flex">
                    <span className="flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600">
                      +91
                    </span>
                    <input
                      id="cb-mobile"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="10-digit number"
                      aria-invalid={Boolean(errors.mobile)}
                      className={`${fieldBase} rounded-l-none ${errors.mobile ? "border-rose-400" : "border-slate-200"}`}
                    />
                  </div>
                  {errors.mobile && <p className="mt-1 text-xs font-medium text-rose-600">{errors.mobile}</p>}
                </div>

                <ChipGroup label="Target exam" options={EXAMS} value={exam} onChange={setExam} error={errors.exam} />
                <ChipGroup label="Current class" options={CLASSES} value={cls} onChange={setCls} error={errors.cls} />

                {/* honeypot — hidden from people and screen readers, bots fill it in */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>

                {errors.form && (
                  <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {errors.form}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2864d7] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#1f52b3] active:scale-[0.99] disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {submitting ? "Sending…" : "Call me back"}
                  {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
                </button>
                <p className="text-center text-[11px] text-slate-400">We'll only use your number to call you about Edurack.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-700">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-[#2864d7] bg-[#2864d7] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-[#2864d7]/50 hover:text-slate-900"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
