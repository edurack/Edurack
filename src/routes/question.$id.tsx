// src/routes/question.$id.tsx  →  /question/<slug>-<questionId>
//
// The page a student lands on from Google. Public and server-rendered (the
// loader runs on the server, like blog/$slug.tsx), so the question text is in
// the HTML Google reads.
//  • Anyone can check their answer or reveal it.
//  • The step-by-step solution is NOT in the page for visitors. It is fetched
//    only after login, through the signed-in submitPyqAnswer endpoint. Keeping
//    it out of the HTML (instead of hiding it with CSS) is deliberate: showing
//    Googlebot something users can't see is cloaking.
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { IconLoader2 as Loader2, IconLock as Lock } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/lib/auth-context";
import { SmartContent } from "@/lib/smart-content";
import { SITE_URL, breadcrumbJsonLd, pageHead, truncate } from "@/lib/seo";
import { parseQuestionParam, plainText, questionContextLines, questionJsonLd, questionTitle, stemKind, type PublicCheckResult, type PyqPublicPage } from "@/lib/pyq-public";
import { GENERAL_TOPIC, UNTAGGED_CHAPTER, type OptionKey, type PyqAnswer } from "@/lib/pyq-types";
import { checkPublicPyqAnswer, getPublicQuestion } from "@/server-functions/pyq-public";
import { submitPyqAnswer } from "@/server-functions/pyq-practice";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/funnel-events";

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

export const Route = createFileRoute("/question/$id")({
  loader: async ({ params }) => {
    const id = parseQuestionParam(params.id);
    if (!id) throw notFound();
    const page = await getPublicQuestion({ data: { id } });
    if (!page) throw notFound();
    // Wrong or outdated slug → permanent redirect to the one canonical url.
    if (params.id !== page.canonical) {
      throw redirect({ to: "/question/$id", params: { id: page.canonical }, statusCode: 301 });
    }
    return page;
  },
  head: ({ loaderData }) => {
    const page = loaderData as PyqPublicPage | undefined;
    if (!page) return { meta: [{ title: "Question not found · Edurack" }, { name: "robots", content: "noindex" }] };

    const { question: q, canonical, indexable } = page;
    const path = `/question/${canonical}`;
    const text = plainText(q.body);
    const where = [q.source.label, q.subject, q.chapter !== UNTAGGED_CHAPTER ? q.chapter : null].filter(Boolean).join(", ");

    // Too little readable text (image-only question etc.): keep it out of
    // search, but let Google follow the related-question links on it.
    if (!indexable) {
      return {
        meta: [{ title: `${truncate(text || `${q.subject} PYQ`, 52)} · Edurack` }, { name: "robots", content: "noindex, follow" }],
        links: [{ rel: "canonical", href: `${SITE_URL}${path}` }],
      };
    }

    // Generic stems ("Match the following…", "Given below are two statements…") would give
    // hundreds of look-alike titles/descriptions, so those are described by kind + chapter + paper.
    const generic = stemKind(text) !== null;
    return pageHead({
      title: questionTitle({ body: q.body, subject: q.subject, chapter: q.chapter, label: q.source.label }),
      description: generic
        ? `${where}. ${truncate(text, 90)} Check the answer free; log in for the solution.`
        : `${truncate(text, 100)} — ${where}. Check the answer free; log in for the step-by-step solution.`,
      path,
      type: "article",
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "PYQ practice", path: "/pyq" },
          { name: truncate(text, 60), path },
        ]),
        questionJsonLd(q, `${SITE_URL}${path}`),
      ],
    });
  },
  notFoundComponent: QuestionNotFound,
  component: QuestionPage,
});

function QuestionNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-foreground">Question not found</h1>
      <p className="mt-2 text-sm text-foreground/60">This question doesn't exist or is no longer available.</p>
      <Link to="/pyq" className="clay-btn mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white">
        Browse PYQs
      </Link>
    </div>
  );
}

// Keyed by question id so moving between related questions starts from a clean slate.
function QuestionPage() {
  const page = Route.useLoaderData() as PyqPublicPage;
  return <QuestionView key={page.question.id} page={page} />;
}

type Outcome = Partial<PublicCheckResult> & {
  isCorrect: boolean;
  revealed: boolean;
  chosenOption?: OptionKey;
  chosenValue?: number;
  /** Present only for signed-in students. */
  solution?: string;
};

function QuestionView({ page }: { page: PyqPublicPage }) {
  const { question: q, examKey, canonical, related, context, adjacent } = page;
  const { user, loading } = useAuth();
  const path = `/question/${canonical}`;

  const [picked, setPicked] = useState<OptionKey | null>(null);
  const [typed, setTyped] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One "question_view" per question per page load, once we know whether the visitor is signed in.
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (loading || viewed.current === q.id) return;
    viewed.current = q.id;
    trackEvent("question_view", { detail: user ? "member" : "visitor" });
  }, [loading, user, q.id]);

  const canCheck = q.type === "mcq" ? picked !== null : typed !== "" && Number.isFinite(Number(typed));
  const disabled = busy || loading || Boolean(outcome);

  async function send(answer: PyqAnswer) {
    if (busy || loading) return;
    setBusy(true);
    setError(null);
    const chosen = answer ? { chosenOption: answer.option, chosenValue: answer.value } : {};
    try {
      if (user) {
        // Signed in: the normal practice endpoint. Returns the solution and saves progress.
        const r = await submitPyqAnswer({ data: { token: await user.getIdToken(), questionId: q.id, answer } });
        setOutcome({
          isCorrect: r.isCorrect,
          revealed: r.revealed,
          correctOption: r.correctOption,
          correctAnswer: r.correctAnswer,
          solution: r.solution ?? "",
          ...chosen,
        });
        trackEvent("answer_checked", { detail: `member-${r.revealed ? "revealed" : r.isCorrect ? "correct" : "wrong"}` });
      } else {
        const r = await checkPublicPyqAnswer({ data: { questionId: q.id, answer } });
        setOutcome({ ...r, ...chosen });
        trackEvent("answer_checked", { detail: `visitor-${r.revealed ? "revealed" : r.isCorrect ? "correct" : "wrong"}` });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const check = () => void send(q.type === "mcq" ? { option: picked! } : { value: Number(typed) });

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs font-semibold text-foreground/50">
          <Link to="/pyq" className="hover:text-foreground">
            PYQ practice
          </Link>
          <span aria-hidden> / </span>
          <span>{q.subject}</span>
          {q.chapter !== UNTAGGED_CHAPTER && (
            <>
              <span aria-hidden> / </span>
              <span>{q.chapter}</span>
            </>
          )}
        </nav>

        <h1 className="font-display text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {q.chapter !== UNTAGGED_CHAPTER ? `${q.chapter}: ` : ""}
          {q.source.label || `${q.subject} previous year question`}
        </h1>

        <article className="clay mt-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-foreground/50">
            <span>{q.difficulty}</span>
            {q.topic !== GENERAL_TOPIC && <span>· {q.topic}</span>}
            <span>· {q.type === "mcq" ? "+4 / −1" : "+4 / 0"}</span>
          </div>

          <SmartContent value={q.body} eager className="mt-3 text-[15px] leading-relaxed text-foreground" />

          {q.type === "mcq" ? (
            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
              {OPTIONS.map((opt) => {
                const chosen = outcome ? outcome.chosenOption === opt : picked === opt;
                const isCorrect = outcome?.correctOption === opt;
                const isWrongChoice = Boolean(outcome) && chosen && !isCorrect;
                return (
                  <button
                    key={opt}
                    role="radio"
                    aria-checked={chosen}
                    disabled={disabled}
                    onClick={() => setPicked(opt)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition-colors duration-150",
                      isCorrect
                        ? "border-emerald-500/50 bg-[var(--mint-soft)]/60"
                        : isWrongChoice
                          ? "border-destructive/50 bg-[var(--coral-soft)]/60"
                          : chosen
                            ? "border-[var(--sky-deep)] bg-[var(--sky-soft)]/50"
                            : "border-transparent bg-foreground/[0.04] hover:bg-foreground/[0.07]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                        isCorrect ? "bg-emerald-600 text-white" : isWrongChoice ? "bg-destructive text-white" : chosen ? "bg-[var(--sky-deep)] text-white" : "bg-foreground/10 text-foreground/60",
                      )}
                    >
                      {opt}
                    </span>
                    <div className="min-w-0 flex-1">
                      <SmartContent value={q.options?.[opt] ?? ""} className="text-foreground" />
                      {isCorrect && <p className="mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Correct answer</p>}
                      {isWrongChoice && <p className="mt-1 text-[11px] font-bold text-destructive">Your answer</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor="answer" className="mb-1.5 block text-xs font-semibold text-foreground/60">
                Your answer (numerical)
              </label>
              <input
                id="answer"
                inputMode="decimal"
                autoComplete="off"
                disabled={disabled}
                value={outcome ? String(outcome.chosenValue ?? "") : typed}
                onChange={(e) => {
                  // Digits, one dot, optional leading minus — nothing else.
                  if (/^-?\d*\.?\d*$/.test(e.target.value)) setTyped(e.target.value);
                }}
                placeholder="e.g. 12 or -3.5"
                className={cn(
                  "clay-inset w-full rounded-2xl border px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-[var(--sky-deep)]",
                  outcome ? (outcome.isCorrect ? "border-emerald-500/50" : "border-destructive/50") : "border-transparent",
                )}
              />
              {outcome && !outcome.isCorrect && (
                <p className="mt-2 text-xs font-semibold text-foreground/60">
                  Correct answer: <span className="text-emerald-700 dark:text-emerald-300">{outcome.correctAnswer}</span>
                </p>
              )}
            </div>
          )}

          {!outcome && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={check}
                disabled={!canCheck || busy || loading}
                className="clay-btn inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Check answer
              </button>
              <button
                onClick={() => void send(null)}
                disabled={busy || loading}
                className="text-xs font-semibold text-foreground/50 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Just show me the answer
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs font-semibold text-destructive">
              {error}
            </p>
          )}

          {outcome && (
            <div className="mt-4 space-y-3">
              <p
                role="status"
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm font-bold",
                  outcome.revealed
                    ? "bg-foreground/[0.05] text-foreground"
                    : outcome.isCorrect
                      ? "bg-[var(--mint-soft)]/60 text-emerald-800 dark:text-emerald-200"
                      : "bg-[var(--coral-soft)]/60 text-destructive",
                )}
              >
                {outcome.revealed
                  ? `Answer: ${q.type === "mcq" ? `option ${outcome.correctOption}` : outcome.correctAnswer}`
                  : outcome.isCorrect
                    ? "Correct! Nice work."
                    : "Not quite — the correct answer is marked above."}
              </p>
              <SolutionBlock outcome={outcome} path={path} />
            </div>
          )}
        </article>

        {/* Keep the student practising: this is where a search visit becomes a user. */}
        <Link
          to="/pyq"
          search={{ exam: examKey ?? undefined, subject: q.subject, chapter: q.chapter, topic: q.topic !== GENERAL_TOPIC ? q.topic : undefined, practice: true }}
          className="clay-chip mt-4 inline-flex rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          Practise more {q.chapter !== UNTAGGED_CHAPTER ? q.chapter : q.subject} PYQs
        </Link>

        {/* Facts specific to this question, in the HTML Google reads: paper, difficulty, chapter weightage, topic repeats. */}
        <section aria-labelledby="about-question" className="clay mt-6 p-4 sm:p-5">
          <h2 id="about-question" className="font-display text-base font-bold text-foreground">
            About this question
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/80">
            {questionContextLines(q, context).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {context && (
            <Link
              to="/neet/chapter-wise-weightage/$subject/$chapter"
              params={{ subject: context.subjectKey, chapter: context.chapterSlug }}
              className="mt-3 inline-block text-sm font-bold text-[var(--sky-deep)] underline-offset-2 hover:underline"
            >
              See {context.chapterName} weightage, topic by topic
            </Link>
          )}
        </section>

        {(adjacent.prev || adjacent.next) && (
          <nav aria-label="Previous and next question" className="mt-6 grid gap-2 sm:grid-cols-2">
            {adjacent.prev ? (
              <Link to="/question/$id" params={{ id: adjacent.prev.param }} className="clay block p-3.5 transition-colors hover:bg-foreground/[0.03]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">← Previous question</p>
                <p className="mt-1 text-sm leading-snug text-foreground">{adjacent.prev.snippet || `${adjacent.prev.chapter} question`}</p>
              </Link>
            ) : (
              <span />
            )}
            {adjacent.next && (
              <Link to="/question/$id" params={{ id: adjacent.next.param }} className="clay block p-3.5 text-right transition-colors hover:bg-foreground/[0.03]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/50">Next question →</p>
                <p className="mt-1 text-sm leading-snug text-foreground">{adjacent.next.snippet || `${adjacent.next.chapter} question`}</p>
              </Link>
            )}
          </nav>
        )}

        {related.length > 0 && (
          <section aria-labelledby="related" className="mt-8">
            <h2 id="related" className="font-display text-base font-bold text-foreground">
              Related questions
            </h2>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.param}>
                  <Link to="/question/$id" params={{ id: r.param }} className="clay block p-3.5 transition-colors hover:bg-foreground/[0.03]">
                    <p className="text-sm leading-snug text-foreground">{r.snippet || `${r.chapter} question`}</p>
                    <p className="mt-1.5 text-[11px] font-semibold text-foreground/50">
                      {r.label} · {r.difficulty}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function SolutionBlock({ outcome, path }: { outcome: Outcome; path: string }) {
  // Signed in: the solution came back with the check.
  if (outcome.solution !== undefined) {
    return outcome.solution.trim() ? (
      <div className="clay-inset rounded-2xl p-4">
        <h2 className="font-display text-sm font-bold text-foreground">Solution</h2>
        <SmartContent value={outcome.solution} className="mt-2 text-sm leading-relaxed text-foreground" />
      </div>
    ) : (
      <p className="text-xs font-semibold text-foreground/50">A written solution hasn't been added for this question yet.</p>
    );
  }
  // Visitor, and the question has no written solution: don't dangle a login for nothing.
  if (outcome.hasSolution === false) {
    return <p className="text-xs font-semibold text-foreground/50">A written solution hasn't been added for this question yet.</p>;
  }
  // Visitor: locked. `redirect` brings them back to this page after login.
  return <LockedSolution path={path} />;
}

function LockedSolution({ path }: { path: string }) {
  // Counted once when the gate appears, then each click, so "gate shown → sign-up click" is measurable.
  useEffect(() => {
    trackEvent("gate_shown", { path });
  }, [path]);
  return (
    <div className="clay-inset rounded-2xl p-5 text-center">
      <Lock className="mx-auto h-5 w-5 text-foreground/50" aria-hidden />
      <p className="font-display mt-2 text-sm font-bold text-foreground">Log in to see the step-by-step solution</p>
      <p className="mt-1 text-xs text-foreground/60">Create an account in a minute and pick up right back here.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link to="/auth" search={{ tab: "signup", redirect: path }} onClick={() => trackEvent("gate_signup_click", { path })} className="clay-btn rounded-full px-5 py-2.5 text-sm font-bold text-white">
          Sign up free
        </Link>
        <Link to="/auth" search={{ tab: "signin", redirect: path }} onClick={() => trackEvent("gate_login_click", { path })} className="clay-chip rounded-full px-5 py-2.5 text-sm font-bold text-foreground">
          Log in
        </Link>
      </div>
    </div>
  );
}
