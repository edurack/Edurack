// The "pick a question" screen shown after a student taps a topic: every question as a numbered row (preview text,
// paper/year tag, difficulty, solved status), with Hide Attempted / Years / Difficulty filters and a year sort.
// Shared by PYQ practice and NCERT Line by Line. Purely presentational: the parent owns the data and the filters.
import { ChevronLeft, ArrowDownUp, Check, X, Eye } from "lucide-react";
import { SmartContent } from "@/lib/smart-content";
import { cn } from "@/lib/utils";
import type { Difficulty } from "@/lib/pyq-types";

export type QuestionListItem = {
  id: string;
  body: string;
  /** Paper tag, e.g. "NEET 2023 (All India)". Omitted for NCERT questions. */
  label?: string;
  difficulty: Difficulty;
  status: "new" | "correct" | "wrong" | "revealed";
};

type Props = {
  title: string;
  subtitle?: string;
  /** Rows to show: already filtered and sorted by the parent. */
  items: QuestionListItem[];
  /** How many questions exist before filters, for "Showing all Qs (25/29)". */
  total: number;
  hideAttempted: boolean;
  onHideAttempted: (v: boolean) => void;
  difficulty: Difficulty | "All";
  onDifficulty: (d: Difficulty | "All") => void;
  /** Paper years to pick from. Leave empty (NCERT) to hide the Years filter. */
  years?: string[];
  year?: string;
  onYear?: (y: string) => void;
  /** Provide to show the "Year-wise (New to Old)" sort toggle. */
  newestFirst?: boolean;
  onToggleSort?: () => void;
  onOpen: (index: number) => void;
  onBack: () => void;
  onClearFilters: () => void;
};

const SELECT_CLS =
  "clay-chip h-9 shrink-0 rounded-full bg-transparent px-3 text-xs font-semibold text-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky-deep)]";

export function QuestionListView({
  title,
  subtitle,
  items,
  total,
  hideAttempted,
  onHideAttempted,
  difficulty,
  onDifficulty,
  years = [],
  year = "All",
  onYear,
  newestFirst,
  onToggleSort,
  onOpen,
  onBack,
  onClearFilters,
}: Props) {
  const filtered = hideAttempted || difficulty !== "All" || year !== "All";

  return (
    <div className="animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-foreground/50">{subtitle}</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="-mx-1 mb-3 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <label className="clay-chip inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-semibold text-foreground/80">
          Hide Attempted
          <button
            type="button"
            role="switch"
            aria-checked={hideAttempted}
            aria-label="Hide attempted questions"
            onClick={() => onHideAttempted(!hideAttempted)}
            className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", hideAttempted ? "bg-[var(--sky-deep)]" : "bg-foreground/20")}
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", hideAttempted ? "left-[1.1rem]" : "left-0.5")} />
          </button>
        </label>
        {onYear && years.length > 1 && (
          <select aria-label="Paper year" value={year} onChange={(e) => onYear(e.target.value)} className={SELECT_CLS}>
            <option value="All">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Difficulty" value={difficulty} onChange={(e) => onDifficulty(e.target.value as Difficulty | "All")} className={SELECT_CLS}>
          <option value="All">Difficulty</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
      </div>

      <div className="mb-1 flex items-center justify-between gap-2 px-1 text-xs">
        <span className="text-foreground/60">
          Showing {filtered ? "" : "all "}Qs ({items.length}/{total})
        </span>
        {onToggleSort && (
          <button onClick={onToggleSort} className="inline-flex items-center gap-1 font-semibold text-[var(--sky-deep)]">
            <ArrowDownUp className="h-3.5 w-3.5" aria-hidden />
            Year-wise ({newestFirst ? "New to Old" : "Old to New"})
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="clay p-8 text-center">
          <p className="font-semibold text-foreground">{total === 0 ? "No questions here yet." : "No questions match these filters."}</p>
          {total > 0 && (
            <button onClick={onClearFilters} className="clay-btn mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ol className="clay divide-y divide-foreground/10 overflow-hidden p-0">
          {items.map((it, i) => (
            <li key={it.id}>
              <button onClick={() => onOpen(i)} className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.07]">
                <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold text-foreground/50">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  {/* Preview: first few lines only; images are capped so one tall figure can't push the list off screen. */}
                  <div className="max-h-[5.5rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)] [&_img]:max-h-32 [&_img]:w-auto">
                    <SmartContent value={it.body} className="pointer-events-none text-[15px] leading-snug text-foreground" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
                    {it.label && <span className="text-[var(--sky-deep)]">{it.label}</span>}
                    <span className={it.difficulty === "Easy" ? "text-emerald-600 dark:text-emerald-400" : it.difficulty === "Hard" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}>
                      {it.difficulty}
                    </span>
                    <StatusBadge status={it.status} />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QuestionListItem["status"] }) {
  if (status === "new") return null;
  const map = {
    correct: { label: "Solved", Icon: Check, cls: "bg-[var(--mint-soft)]/70 text-emerald-800 dark:text-emerald-200" },
    wrong: { label: "Got wrong", Icon: X, cls: "bg-[var(--coral-soft)]/70 text-destructive" },
    revealed: { label: "Solution viewed", Icon: Eye, cls: "bg-foreground/10 text-foreground/60" },
  } as const;
  const { label, Icon, cls } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
