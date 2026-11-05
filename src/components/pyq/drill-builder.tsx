// The Edurack Pro drill builder: pick several chapters/topics (across subjects), give each its own difficulty,
// choose the length and paper years, and start. Picks sit in a "loadout" with a flame meter per slot; the Start
// button shows how hard the whole drill is. The server (startPyqDrill) re-checks everything and gives every pick
// a fair share of the questions.
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Flame, Plus, Search, X } from "lucide-react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { getPyqTree } from "@/server-functions/pyq-practice";
import { getDrillBuilderYears } from "@/server-functions/pro";
import { CUSTOM_DRILL_COUNTS, type CustomDrillInput } from "@/lib/pro";
import { DRILL_QUESTIONS } from "@/lib/practice-schedule";
import { MAX_DRILL_PICKS, drillRating, pickKey, type DrillPick } from "@/lib/drill-picks";
import type { Difficulty, PyqChapterNode, PyqSubjectNode, PyqTree } from "@/lib/pyq-types";
import { cn } from "@/lib/utils";

type BuilderUser = { getIdToken: () => Promise<string> };

// Fixed accent per subject, so a subject keeps its colour on the tab, the chapter rows and the loadout.
const SUBJECT_COLORS: { match: RegExp; color: string }[] = [
  { match: /phys/i, color: "#4f86f0" },
  { match: /chem/i, color: "#e89b1c" },
  { match: /bot|biolog/i, color: "#22a979" },
  { match: /zoo/i, color: "#e0527a" },
  { match: /math/i, color: "#8b6cf0" },
];
const FALLBACK_COLORS = ["#4f86f0", "#e89b1c", "#22a979", "#e0527a"];
const subjectColor = (name: string, i: number) => SUBJECT_COLORS.find((s) => s.match.test(name))?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];

// Difficulty is a flame meter: Any = none lit, Easy = 1, Medium = 2, Hard = 3.
const LEVELS: { value: Difficulty | ""; label: string; flames: number; color: string }[] = [
  { value: "", label: "Any", flames: 0, color: "#64748b" },
  { value: "Easy", label: "Easy", flames: 1, color: "#16a34a" },
  { value: "Medium", label: "Medium", flames: 2, color: "#d97706" },
  { value: "Hard", label: "Hard", flames: 3, color: "#e11d48" },
];

function Flames({ lit, total = 3, color, className }: { lit: number; total?: number; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <Flame key={i} className="h-3.5 w-3.5" style={{ color: i < lit ? color : undefined, fill: i < lit ? color : "none", opacity: i < lit ? 1 : 0.3 }} />
      ))}
    </span>
  );
}

/** Four-way difficulty control for one pick (or, with `label`, for all picks at once). */
/** `value` null = the picks differ, so nothing is shown as selected. */
function DifficultyControl({ value, onChange, label, compact }: { value: Difficulty | "" | null; onChange: (v: Difficulty | "") => void; label: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1">
      {LEVELS.map((l) => {
        const on = value === l.value;
        return (
          <button
            key={l.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l.value)}
            style={on ? { borderColor: l.color, backgroundColor: `${l.color}1f`, color: l.color } : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
              on ? "" : "border-border text-foreground/60 hover:bg-foreground/5",
              compact && "min-h-10",
            )}
          >
            {l.flames > 0 ? <Flames lit={l.flames} total={l.flames} color={on ? l.color : "currentColor"} /> : <span className="h-3.5 text-[13px] leading-[14px]">∞</span>}
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none";

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
  const rating = drillRating(picks);
  const minutes = Math.round(count * 1.5);
  const sharedDifficulty = picks.length > 0 && picks.every((p) => (p.difficulty ?? "") === (picks[0].difficulty ?? "")) ? (picks[0].difficulty ?? "") : null;

  const start = () => onStart({ custom: { picks, years: pickedYears.length ? pickedYears : undefined, count } });

  if (loadError) {
    return (
      <div className="mt-4 rounded-xl bg-[var(--sky-soft)] px-4 py-3 text-sm font-semibold text-foreground/80" role="alert">
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
    <div className="space-y-5 text-left">
      {/* 1. Subject tabs: the dot shows how many picks that subject already holds. */}
      <div>
        <p className="text-xs font-bold text-foreground/70">1. Choose chapters and topics</p>
        <div role="tablist" aria-label="Subject" className="mt-2 flex flex-wrap gap-1.5">
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
                style={on ? { borderColor: color, backgroundColor: `${color}1f` } : undefined}
                className={cn(chip, on ? "text-foreground" : "border-border text-foreground/60 hover:bg-foreground/5")}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                {s.subject}
                {n > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-extrabold text-white" style={{ backgroundColor: color }}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Chapters of the chosen subject. Tap a chapter to take all of it, or open it to take single topics. */}
      <div>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3">
          <Search className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden />
          <span className="sr-only">Search chapters and topics</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${activeSubject?.subject ?? ""} chapters and topics`} className="w-full bg-transparent text-sm placeholder:text-foreground/40 focus:outline-none" />
        </label>
        <ul className="mt-2 max-h-[26rem] space-y-1.5 overflow-y-auto pr-0.5">
          {chapters.length === 0 && <li className="py-6 text-center text-sm text-foreground/50">No chapter or topic matches "{query}".</li>}
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
      </div>

      {/* 3. The loadout: every pick with its own difficulty. */}
      <div className="rounded-2xl border border-border bg-foreground/[0.03] p-3 sm:p-4" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-foreground/70">2. Set the difficulty for each</p>
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-bold text-foreground/70">
            {picks.length} / {MAX_DRILL_PICKS}
          </span>
        </div>
        {note && (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
            {note}
          </p>
        )}
        {picks.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-foreground/55">Nothing picked yet. Tap a chapter above to add it, or open it to add single topics.</p>
        ) : (
          <>
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-semibold text-foreground/55">Same difficulty for all</p>
              <DifficultyControl value={sharedDifficulty} onChange={setAll} label="Difficulty for all picks" compact />
            </div>
            <ul className="mt-3 space-y-2">
              {picks.map((p) => {
                const key = pickKey(p);
                const si = subjects.findIndex((s) => s.subject === p.subject);
                const color = subjectColor(p.subject, Math.max(0, si));
                const avail = availableFor(p);
                return (
                  <li key={key} className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex items-start gap-2.5 p-3 pb-2" style={{ borderLeft: `4px solid ${color}` }}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{p.topic ?? p.chapter}</p>
                        <p className="truncate text-[11px] text-foreground/55">
                          {p.subject}
                          {p.topic ? ` · ${p.chapter}` : " · whole chapter"} · {avail} question{avail === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button type="button" onClick={() => toggle(p)} aria-label={`Remove ${p.topic ?? p.chapter}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/45 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <div className="px-3 pb-3">
                      <DifficultyControl value={p.difficulty ?? ""} onChange={(d) => setDifficulty(key, d)} label={`Difficulty for ${p.topic ?? p.chapter}`} compact />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* 4. Length and paper years. */}
      <fieldset>
        <legend className="text-xs font-bold text-foreground/70">3. How long?</legend>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {CUSTOM_DRILL_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              onClick={() => setCount(n)}
              className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none", count === n ? "border-foreground bg-foreground text-background" : "border-border text-foreground/75 hover:bg-foreground/5")}
            >
              {n}
              <span className={cn("text-[10px] font-semibold", count === n ? "text-background/70" : "text-foreground/50")}>{Math.round(n * 1.5)} min</span>
            </button>
          ))}
        </div>
      </fieldset>

      {years.length > 0 && (
        <div>
          <button type="button" aria-expanded={showYears} onClick={() => setShowYears((v) => !v)} className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-xs font-bold text-foreground/70">
            <span>
              Paper years <span className="font-medium text-foreground/45">{pickedYears.length === 0 ? "(all years)" : `(${pickedYears.length} chosen)`}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", showYears && "rotate-180")} aria-hidden />
          </button>
          {showYears && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={pickedYears.includes(y)} onClick={() => toggleYear(y)} className={cn(chip, pickedYears.includes(y) ? "border-foreground bg-foreground text-background" : "border-border text-foreground/70 hover:bg-foreground/5")}>
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Summary + start. */}
      <div className="rounded-2xl bg-[#141b2b] p-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <p className="text-sm font-bold">
              {picks.length === 0 ? "Pick at least one chapter or topic" : `${picks.length} pick${picks.length === 1 ? "" : "s"} · ${count} questions · ${minutes} min`}
            </p>
            {picks.length > 0 && totalAvailable < count && <p className="mt-0.5 text-xs text-amber-200">These picks hold {totalAvailable} questions, so the drill will be shorter.</p>}
          </div>
          {picks.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold" style={{ color: LEVELS[rating.level].color }}>
              <Flames lit={rating.level} color={LEVELS[rating.level].color} /> {rating.label}
            </span>
          )}
        </div>
        <button type="button" onClick={start} disabled={starting || picks.length === 0} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-[#141b2b] transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#141b2b] motion-reduce:transition-none">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Flame className="h-4 w-4" aria-hidden />}
          Start my drill
        </button>
        <p className="mt-2 text-center text-[11px] text-white/55">Every pick gets an equal share of questions. New questions come first.</p>
      </div>
    </div>
  );
}

function ChapterRow({ chapter, subject, color, expanded, onExpand, isPicked, pickedHere, onToggle }: { chapter: PyqChapterNode; subject: string; color: string; expanded: boolean; onExpand: () => void; isPicked: (p: Pick<DrillPick, "subject" | "chapter" | "topic">) => boolean; pickedHere: number; onToggle: (p: DrillPick) => void }) {
  const whole = isPicked({ subject, chapter: chapter.chapter });
  const solvedPct = chapter.count > 0 ? Math.round((Math.min(chapter.correct, chapter.count) / chapter.count) * 100) : 0;
  const active = whole || pickedHere > 0;
  const multiTopic = chapter.topics.length > 1;
  return (
    <li className="overflow-hidden rounded-xl border bg-card transition-colors motion-reduce:transition-none" style={{ borderColor: active ? color : undefined }}>
      <div className="flex items-stretch">
        <button type="button" aria-pressed={whole} onClick={() => onToggle({ subject, chapter: chapter.chapter })} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors motion-reduce:transition-none" style={{ borderColor: color, backgroundColor: whole ? color : "transparent" }} aria-hidden>
            {whole ? <Check className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4" style={{ color }} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{chapter.chapter}</span>
            <span className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground/55">
              {chapter.count} questions{pickedHere > 0 && !whole ? ` · ${pickedHere} topic${pickedHere === 1 ? "" : "s"} picked` : ""}
              <span className="h-1 w-14 overflow-hidden rounded-full bg-foreground/10" role="presentation">
                <span className="block h-full rounded-full" style={{ width: `${solvedPct}%`, backgroundColor: color }} />
              </span>
              {solvedPct}% solved
            </span>
          </span>
        </button>
        {multiTopic && (
          <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} topics of ${chapter.chapter}`} onClick={onExpand} className="grid w-12 shrink-0 place-items-center border-l border-border text-foreground/50 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
            <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>
      {multiTopic && expanded && (
        <div className="flex flex-wrap gap-1.5 border-t border-border bg-foreground/[0.03] p-3">
          {chapter.topics.map((t) => {
            const on = isPicked({ subject, chapter: chapter.chapter, topic: t.topic });
            return (
              <button key={t.topic} type="button" aria-pressed={on} onClick={() => onToggle({ subject, chapter: chapter.chapter, topic: t.topic })} style={on ? { borderColor: color, backgroundColor: `${color}22` } : undefined} className={cn(chip, "min-h-10", on ? "text-foreground" : "border-border text-foreground/70 hover:bg-foreground/5")}>
                {on && <Check className="h-3.5 w-3.5" style={{ color }} aria-hidden />}
                {t.topic}
                <span className="text-[10px] font-semibold text-foreground/45">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
