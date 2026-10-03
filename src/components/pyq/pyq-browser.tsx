import { ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNTAGGED_CHAPTER, type PyqTree } from "@/lib/pyq-types";

export type PyqNav = { subject?: string; chapter?: string; topic?: string; practice?: boolean };

type Props = {
  tree: PyqTree;
  subject?: string;
  chapter?: string;
  onNavigate: (next: PyqNav) => void;
};

/** Browse screens: Subjects → Chapters → Topics. Practising starts from a chapter or topic. */
export function PyqBrowser({ tree, subject, chapter, onNavigate }: Props) {
  const subjectNode = tree.subjects.find((s) => s.subject === subject);
  const chapterNode = subjectNode?.chapters.find((c) => c.chapter === chapter);

  // Unknown subject/chapter in the URL (stale link) → fall back a level instead of a blank page.
  if (subject && !subjectNode) return <NotFound onBack={() => onNavigate({})} label="That subject isn't available." />;
  if (chapter && subjectNode && !chapterNode)
    return <NotFound onBack={() => onNavigate({ subject })} label="That chapter isn't available." />;

  const crumbs = [
    { label: "All subjects", nav: {} as PyqNav },
    ...(subjectNode ? [{ label: subjectNode.subject, nav: { subject: subjectNode.subject } as PyqNav }] : []),
    ...(chapterNode ? [{ label: chapterNode.chapter, nav: { subject, chapter: chapterNode.chapter } as PyqNav }] : []),
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      <Crumbs crumbs={crumbs} onNavigate={onNavigate} />

      {!subjectNode && (
        <>
          <Intro total={tree.totalQuestions} correct={tree.totalCorrect} />
          {tree.subjects.length === 0 ? (
            <div className="clay mt-4 p-8 text-center text-sm text-foreground/60">No previous year questions are available yet.</div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {tree.subjects.map((s) => (
                <Row
                  key={s.subject}
                  big
                  title={s.subject}
                  meta={`${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"} · ${s.count} questions`}
                  count={s.count}
                  attempted={s.attempted}
                  correct={s.correct}
                  onClick={() => onNavigate({ subject: s.subject })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {subjectNode && !chapterNode && (
        <>
          <Title title={subjectNode.subject} sub={`${subjectNode.count} questions across ${subjectNode.chapters.length} chapters`} />
          <div className="mt-4 space-y-2.5">
            {subjectNode.chapters.map((c) => (
              <Row
                key={c.chapter}
                title={c.chapter}
                muted={c.chapter === UNTAGGED_CHAPTER}
                meta={`${c.count} question${c.count === 1 ? "" : "s"}${c.topics.length > 1 ? ` · ${c.topics.length} topics` : ""}`}
                count={c.count}
                attempted={c.attempted}
                correct={c.correct}
                onClick={() => onNavigate({ subject, chapter: c.chapter })}
              />
            ))}
          </div>
        </>
      )}

      {subjectNode && chapterNode && (
        <>
          <Title title={chapterNode.chapter} sub={`${subjectNode.subject} · ${chapterNode.count} questions`} />
          <button
            onClick={() => onNavigate({ subject, chapter, practice: true })}
            className="clay-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold text-white sm:w-auto"
          >
            <Play className="h-4 w-4" aria-hidden />
            Practice all {chapterNode.count} questions
          </button>

          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-foreground/50">Or pick a topic</p>
          <div className="space-y-2.5">
            {chapterNode.topics.map((t) => (
              <Row
                key={t.topic}
                title={t.topic}
                meta={`${t.count} question${t.count === 1 ? "" : "s"}`}
                count={t.count}
                attempted={t.attempted}
                correct={t.correct}
                onClick={() => onNavigate({ subject, chapter, topic: t.topic, practice: true })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Crumbs({ crumbs, onNavigate }: { crumbs: { label: string; nav: PyqNav }[]; onNavigate: (n: PyqNav) => void }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="-mx-1 mb-4 flex items-center gap-1 overflow-x-auto px-1 pb-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${i}-${c.label}`} className="inline-flex shrink-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-foreground/30" aria-hidden />}
            <button
              onClick={() => !last && onNavigate(c.nav)}
              disabled={last}
              className={cn(
                "max-w-[11rem] truncate rounded-full px-2.5 py-1.5 font-semibold",
                last ? "bg-foreground/5 text-foreground" : "text-foreground/50 hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function Intro({ total, correct }: { total: number; correct: number }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">PYQ Practice</h1>
      <p className="mt-1 text-sm text-foreground/60">
        {total > 0 ? (
          <>
            {total} previous year questions · <span className="font-semibold text-foreground">{correct}</span> solved
          </>
        ) : (
          "Previous year questions, chapter by chapter."
        )}
      </p>
    </div>
  );
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="font-display text-xl font-bold leading-snug text-foreground sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-foreground/60">{sub}</p>
    </div>
  );
}

function Row({
  title,
  meta,
  count,
  attempted,
  correct,
  onClick,
  big,
  muted,
}: {
  title: string;
  meta: string;
  count: number;
  attempted: number;
  correct: number;
  onClick: () => void;
  big?: boolean;
  muted?: boolean;
}) {
  const pct = count > 0 ? Math.round((correct / count) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "clay-inset w-full rounded-2xl text-left transition-transform duration-150 active:scale-[0.99]",
        big ? "p-4 sm:p-5" : "px-4 py-3.5",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold leading-snug", big ? "font-display text-lg" : "text-sm", muted ? "text-foreground/60" : "text-foreground")}>
            {title}
          </p>
          <p className="mt-0.5 text-xs text-foreground/50">{meta}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-foreground/60">{pct}%</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" aria-hidden />
      </div>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${correct} of ${count} solved`}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${correct > 0 ? Math.max(3, pct) : 0}%` }}
        />
      </div>
      {attempted > 0 && (
        <p className="mt-1.5 text-[11px] text-foreground/40">
          {attempted} tried · {correct} correct
        </p>
      )}
    </button>
  );
}

function NotFound({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="clay mx-auto max-w-md p-8 text-center">
      <p className="text-sm text-foreground/70">{label}</p>
      <button onClick={onBack} className="clay-btn mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white">
        Go back
      </button>
    </div>
  );
}
