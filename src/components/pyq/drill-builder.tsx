// The custom drill builder (Edurack Pro): pick chapters or topics, choose a difficulty and a length, and start.
// One calm column: What to practise → Difficulty → Length → (optional) paper years, with a Start bar that stays in reach.
// Per-topic difficulty still exists but lives behind a small "Fine-tune" link, so the common case is three taps.
// The server (startPyqDrill) re-checks everything and gives every pick a fair share of the questions.
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { getPyqTree } from "@/server-functions/pyq-practice";
import { getDrillBuilderYears } from "@/server-functions/pro";
import { CUSTOM_DRILL_COUNTS, type CustomDrillInput } from "@/lib/pro";
import { DRILL_QUESTIONS } from "@/lib/practice-schedule";
import { MAX_DRILL_PICKS, pickKey, type DrillPick } from "@/lib/drill-picks";
import type { Difficulty, PyqChapterNode, PyqSubjectNode, PyqTree } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";

type BuilderUser = { getIdToken: () => Promise<string> };

// One accent per subject: used only for a small dot and the check, so the screen stays quiet.
const SUBJECT_COLORS: { match: RegExp; color: string }[] = [
  { match: /phys/i, color: "#4f86f0" },
  { match: /chem/i, color: "#e89b1c" },
  { match: /bot|biolog/i, color: "#22a979" },
  { match: /zoo/i, color: "#e0527a" },
  { match: /math/i, color: "#8b6cf0" },
];
const FALLBACK_COLORS = ["#4f86f0", "#e89b1c", "#22a979", "#e0527a"];
const subjectColor = (name: string, i: number) => SUBJECT_COLORS.find((s) => s.match.test(name))?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];

const LEVELS: { value: Difficulty | ""; label: string; short: string; color: string }[] = [
  { value: "", label: "Any", short: "Any", color: "#64748b" },
  { value: "Easy", label: "Easy", short: "Easy", color: "#16a34a" },
  { value: "Medium", label: "Medium", short: "Med", color: "#d97706" },
  { value: "Hard", label: "Hard", short: "Hard", color: "#e11d48" },
];

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-deep)]";

/** A row of mutually exclusive options that share the width. `value` null = nothing selected (mixed). */
function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T | null; options: { value: T; label: string; sub?: string; color?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-foreground/[0.06] p-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn("flex min-h-11 flex-col items-center justify-center rounded-xl px-2 text-sm font-bold transition-all motion-reduce:transition-none", focus, on ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground")}
            style={on && o.color ? { color: o.color } : undefined}
          >
            {o.label}
            {o.sub && <span className="text-[10px] font-semibold text-foreground/45">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function DrillBuilder({ user, exam, starting, onStart }: { user: BuilderUser; exam?: string; starting: boolean; onStart: (o: { custom: CustomDrillInput }) => void }) {
  const [tree, setTree] = useState<PyqTree | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [years, setYears] = useState<string[]>([]);
  const [pickedYears, setPickedYears] = useState<string[]>([]);
  const [showYears, setShowYears] = useState(false);
  const [subject, setSubject] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null); // the chapter whose topics are showing
  const [picks, setPicks] = useState<DrillPick[]>([]);
  const [bulk, setBulk] = useState<Difficulty | "">(""); // what a new pick starts with: the last "all picks" choice
  const [fineTune, setFineTune] = useState(false);
  const [count, setCount] = useState<number>(DRILL_QUESTIONS);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadError(false);
    (async () => {
      try {
        const token = await user.getIdToken();
        const [t, y] = await Promise.all([getPyqTree({ data: { token, exam } }), getDrillBuilderYears({ data: { token, exam } })]);
        if (!alive) return;
        setTree(t);
        setYears(y);
        setSubject((cur) => cur || t.subjects[0]?.subject || "");
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, exam, reload]);

  const subjects = tree?.subjects ?? [];
  const activeIndex = Math.max(0, subjects.findIndex((s) => s.subject === subject));
  const activeSubject: PyqSubjectNode | undefined = subjects[activeIndex];
  const chapters = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = activeSubject?.chapters ?? [];
    return q ? list.filter((c) => c.chapter.toLowerCase().includes(q) || c.topics.some((t) => t.topic.toLowerCase().includes(q))) : list;
  }, [activeSubject, query]);

  const isPicked = (p: Pick<DrillPick, "subject" | "chapter" | "topic">) => picks.some((x) => pickKey(x) === pickKey(p));
  const picksIn = (sub: string, chapter?: string) => picks.filter((p) => p.subject === sub && (chapter === undefined || p.chapter === chapter)).length;

  // How many questions a pick can draw from (before its difficulty is applied).
  const availableFor = (p: DrillPick): number => {
    const c = subjects.find((s) => s.subject === p.subject)?.chapters.find((x) => x.chapter === p.chapter);
    if (!c) return 0;
    return p.topic ? (c.topics.find((t) => t.topic === p.topic)?.count ?? 0) : c.count;
  };

  function toggle(next: DrillPick) {
    setNote(null);
    const key = pickKey(next);
    if (picks.some((p) => pickKey(p) === key)) {
      setPicks(picks.filter((p) => pickKey(p) !== key));
      return;
    }
    // A whole chapter and its own topics would overlap, so choosing one replaces the other.
    const sameChapter = (p: DrillPick) => p.subject === next.subject && p.chapter === next.chapter;
    const kept = next.topic ? picks.filter((p) => !(sameChapter(p) && !p.topic)) : picks.filter((p) => !sameChapter(p));
    if (kept.length >= MAX_DRILL_PICKS) {
      setNote(`A drill holds up to ${MAX_DRILL_PICKS} picks. Remove one to add another.`);
      return;
    }
    setPicks([...kept, { ...next, ...(bulk ? { difficulty: bulk } : {}) }]);
  }

  const setDifficulty = (key: string, d: Difficulty | "") => setPicks((ps) => ps.map((p) => (pickKey(p) === key ? { ...p, difficulty: d || undefined } : p)));
  function setAll(d: Difficulty | "") {
    setBulk(d);
    setPicks((ps) => ps.map((p) => ({ ...p, difficulty: d || undefined })));
  }
  const toggleYear = (y: string) => setPickedYears((p) => (p.includes(y) ? p.filter((x) => x !== y) : [...p, y]));

  const totalAvailable = picks.reduce((n, p) => n + availableFor(p), 0);
  const minutes = Math.round(count * 1.5);
  // null when the picks have different difficulties (set in Fine-tune): the control then shows "Mixed" and nothing selected.
  const sharedDifficulty: Difficulty | "" | null = picks.length === 0 ? bulk : picks.every((p) => (p.difficulty ?? "") === (picks[0].difficulty ?? "")) ? (picks[0].difficulty ?? "") : null;
  const start = () => onStart({ custom: { picks, years: pickedYears.length ? pickedYears : undefined, count } });

  if (loadError) {
    return (
      <div className="mt-4 rounded-2xl bg-[var(--sky-soft)] px-4 py-3 text-sm font-semibold text-foreground/80" role="alert">
        We couldn't load the chapters.{" "}
        <button type="button" onClick={() => setReload((n) => n + 1)} className="underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }
  if (!tree) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-foreground/50" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading chapters…
      </div>
    );
  }
  if (subjects.length === 0) return <p className="py-6 text-sm text-foreground/60">There are no chapters to build a drill from yet. Check back soon.</p>;

  return (
    <div className="space-y-6 text-left">
      {/* 1 · What to practise */}
      <section aria-labelledby="drill-what">
        <h3 id="drill-what" className="text-sm font-bold text-foreground">
          What do you want to practise?
        </h3>

        <div role="tablist" aria-label="Subject" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {subjects.map((s, i) => {
            const color = subjectColor(s.subject, i);
            const n = picksIn(s.subject);
            const on = s.subject === activeSubject?.subject;
            return (
              <button
                key={s.subject}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setSubject(s.subject);
                  setOpen(null);
                  setQuery("");
                }}
                className={cn("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors motion-reduce:transition-none", focus, on ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10")}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                {s.subject}
                {n > 0 && <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-extrabold", on ? "bg-background text-foreground" : "bg-foreground text-background")}>{n}</span>}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex min-h-11 items-center gap-2 rounded-2xl bg-foreground/[0.06] px-3.5">
          <Search className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden />
          <span className="sr-only">Search chapters and topics</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${activeSubject?.subject ?? ""}`} className="w-full bg-transparent text-sm placeholder:text-foreground/40 focus:outline-none" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid h-6 w-6 place-items-center rounded-full text-foreground/45 hover:bg-foreground/10">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </label>

        <ul className="mt-2 max-h-80 divide-y divide-foreground/10 overflow-y-auto rounded-2xl bg-foreground/[0.03]">
          {chapters.length === 0 && <li className="py-8 text-center text-sm text-foreground/50">Nothing matches "{query}".</li>}
          {chapters.map((c) => (
            <ChapterRow
              key={c.chapter}
              chapter={c}
              subject={activeSubject!.subject}
              color={subjectColor(activeSubject!.subject, activeIndex)}
              expanded={open === c.chapter || (query.trim() !== "" && c.topics.some((t) => t.topic.toLowerCase().includes(query.trim().toLowerCase())))}
              onExpand={() => setOpen((cur) => (cur === c.chapter ? null : c.chapter))}
              isPicked={isPicked}
              pickedHere={picksIn(activeSubject!.subject, c.chapter)}
              onToggle={toggle}
            />
          ))}
        </ul>
        {note && (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
            {note}
          </p>
        )}

        {/* What's chosen so far, across subjects. Tap one to remove it. */}
        {picks.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-live="polite">
            {picks.map((p) => {
              const si = subjects.findIndex((s) => s.subject === p.subject);
              return (
                <button key={pickKey(p)} type="button" onClick={() => toggle(p)} aria-label={`Remove ${p.topic ?? p.chapter}`} className={cn("inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.07] py-1 pl-2.5 pr-2 text-xs font-semibold text-foreground hover:bg-foreground/10", focus)}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: subjectColor(p.subject, Math.max(0, si)) }} aria-hidden />
                  <span className="truncate">{p.topic ?? p.chapter}</span>
                  <X className="h-3 w-3 shrink-0 text-foreground/45" aria-hidden />
                </button>
              );
            })}
            <button type="button" onClick={() => setPicks([])} className="px-1.5 text-xs font-semibold text-foreground/50 underline-offset-2 hover:text-foreground hover:underline">
              Clear all
            </button>
          </div>
        )}
      </section>

      {/* 2 · Difficulty */}
      <section aria-labelledby="drill-diff">
        <div className="flex items-center justify-between gap-2">
          <h3 id="drill-diff" className="text-sm font-bold text-foreground">
            Difficulty
          </h3>
          {picks.length > 1 && (
            <button type="button" aria-expanded={fineTune} onClick={() => setFineTune((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sky-deep)]">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {fineTune ? "Hide fine-tune" : "Fine-tune each"}
            </button>
          )}
        </div>
        <div className="mt-2">
          <Segmented value={sharedDifficulty} onChange={setAll} label="Difficulty for the whole drill" options={LEVELS.map((l) => ({ value: l.value, label: l.label, color: l.color }))} />
          {sharedDifficulty === null && <p className="mt-1.5 text-xs text-foreground/50">Mixed: each pick has its own level. Choose one above to make them all the same.</p>}
        </div>
        {fineTune && picks.length > 1 && (
          <ul className="mt-3 space-y-2">
            {picks.map((p) => {
              const key = pickKey(p);
              const avail = availableFor(p);
              return (
                <li key={key} className="rounded-2xl bg-foreground/[0.03] p-3">
                  <p className="truncate text-sm font-bold text-foreground">{p.topic ?? p.chapter}</p>
                  <p className="mb-2 truncate text-[11px] text-foreground/50">
                    {p.subject}
                    {p.topic ? ` · ${p.chapter}` : ""} · {avail} question{avail === 1 ? "" : "s"}
                  </p>
                  <Segmented value={p.difficulty ?? ""} onChange={(d) => setDifficulty(key, d)} label={`Difficulty for ${p.topic ?? p.chapter}`} options={LEVELS.map((l) => ({ value: l.value, label: l.short, color: l.color }))} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3 · Length */}
      <section aria-labelledby="drill-len">
        <h3 id="drill-len" className="text-sm font-bold text-foreground">
          How many questions?
        </h3>
        <div className="mt-2">
          <Segmented value={count} onChange={setCount} label="Number of questions" options={CUSTOM_DRILL_COUNTS.map((n) => ({ value: n as number, label: String(n), sub: `${Math.round(n * 1.5)} min` }))} />
        </div>
      </section>

      {/* 4 · Paper years (optional) */}
      {years.length > 0 && (
        <section>
          <button type="button" aria-expanded={showYears} onClick={() => setShowYears((v) => !v)} className="flex min-h-10 w-full items-center justify-between gap-2 text-left">
            <span className="text-sm font-bold text-foreground">
              Paper years <span className="text-xs font-medium text-foreground/50">{pickedYears.length === 0 ? "· all years" : `· ${pickedYears.length} chosen`}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 text-foreground/50 transition-transform motion-reduce:transition-none", showYears && "rotate-180")} aria-hidden />
          </button>
          {showYears && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {years.map((y) => {
                const on = pickedYears.includes(y);
                return (
                  <button key={y} type="button" aria-pressed={on} onClick={() => toggleYear(y)} className={cn("min-h-9 rounded-full px-3.5 text-xs font-bold transition-colors motion-reduce:transition-none", focus, on ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10")}>
                    {y}
                  </button>
                );
              })}
              {pickedYears.length > 0 && (
                <button type="button" onClick={() => setPickedYears([])} className="px-2 text-xs font-semibold text-foreground/50 underline-offset-2 hover:text-foreground hover:underline">
                  All years
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Start: stays on screen while the student scrolls the list. */}
      <div className="sticky bottom-3 z-10 rounded-3xl bg-background/90 p-2 shadow-lg ring-1 ring-border backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 pl-2">
            <p className="truncate text-sm font-bold text-foreground">{picks.length === 0 ? "Pick a chapter to begin" : `${picks.length} pick${picks.length === 1 ? "" : "s"} · ${count} Qs · ${minutes} min`}</p>
            {picks.length > 0 && totalAvailable < count ? (
              <p className="truncate text-[11px] font-semibold text-amber-600 dark:text-amber-400">Only {totalAvailable} questions available, so it will be shorter.</p>
            ) : (
              <p className="truncate text-[11px] text-foreground/50">New questions come first.</p>
            )}
          </div>
          <button type="button" onClick={start} disabled={starting || picks.length === 0} className={cn("clay-btn inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none", focus)}>
            {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

function ChapterRow({ chapter, subject, color, expanded, onExpand, isPicked, pickedHere, onToggle }: { chapter: PyqChapterNode; subject: string; color: string; expanded: boolean; onExpand: () => void; isPicked: (p: Pick<DrillPick, "subject" | "chapter" | "topic">) => boolean; pickedHere: number; onToggle: (p: DrillPick) => void }) {
  const whole = isPicked({ subject, chapter: chapter.chapter });
  const multiTopic = chapter.topics.length > 1;
  const some = !whole && pickedHere > 0;
  return (
    <li>
      <div className="flex items-stretch">
        <button type="button" aria-pressed={whole} onClick={() => onToggle({ subject, chapter: chapter.chapter })} className={cn("flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left", focus)}>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors motion-reduce:transition-none" style={{ borderColor: whole || some ? color : undefined, backgroundColor: whole ? color : "transparent" }} aria-hidden>
            {whole && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            {some && <span className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{chapter.chapter}</span>
            <span className="block truncate text-[11px] text-foreground/50">
              {chapter.count} question{chapter.count === 1 ? "" : "s"}
              {some ? ` · ${pickedHere} topic${pickedHere === 1 ? "" : "s"} picked` : ""}
            </span>
          </span>
        </button>
        {multiTopic && (
          <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} topics of ${chapter.chapter}`} onClick={onExpand} className={cn("inline-flex shrink-0 items-center gap-1 px-3.5 text-xs font-semibold text-foreground/55 hover:text-foreground", focus)}>
            {chapter.topics.length} topics
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-90")} aria-hidden />
          </button>
        )}
      </div>
      {multiTopic && expanded && (
        <div className="space-y-0.5 bg-foreground/[0.04] px-2 py-2">
          {chapter.topics.map((t) => {
            const on = isPicked({ subject, chapter: chapter.chapter, topic: t.topic });
            return (
              <button key={t.topic} type="button" aria-pressed={on} onClick={() => onToggle({ subject, chapter: chapter.chapter, topic: t.topic })} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-foreground/[0.05]", focus)}>
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition-colors motion-reduce:transition-none" style={{ borderColor: on ? color : undefined, backgroundColor: on ? color : "transparent" }} aria-hidden>
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">{t.topic}</span>
                <span className="shrink-0 text-[11px] font-semibold text-foreground/45">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
