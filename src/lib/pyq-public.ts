// Public (indexable) question pages: /question/<slug>-<id>
//
// Pure — no server imports — so the route, the server functions and the
// sitemap all build the SAME url for a question. The slug is only there for
// humans and search engines; the 24-char ObjectId at the end is what we look
// the question up by, so a stale or edited slug never breaks a link (the page
// 301s to the current slug instead).
import type { ExamKey } from "@/lib/admin-types";
import { UNTAGGED_CHAPTER, type Difficulty, type OptionKey, type PyqQuestion } from "@/lib/pyq-types";
import { SITE_URL, truncate } from "@/lib/seo";

/** Questions whose readable text is shorter than this (image-only, "Match the following" stubs…) stay out of Google. */
export const MIN_INDEXABLE_CHARS = 40;

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", theta: "θ", lambda: "λ",
  mu: "μ", pi: "π", rho: "ρ", sigma: "σ", phi: "φ", omega: "ω", Omega: "Ω",
};

/** A few common LaTeX bits → readable text, so titles/descriptions don't show backslashes. */
function latexToText(src: string): string {
  let t = src;
  for (let i = 0; i < 3; i++) t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  return t
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\([a-zA-Z]+)/g, (_m, name: string) => GREEK[name] ?? "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Question/option text → plain text for <title>, meta description and slugs: images and LaTeX markup removed. */
export function plainText(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // markdown images
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\$\$([^$]+)\$\$|\$([^$]+)\$/g, (_m, display?: string, inline?: string) => ` ${latexToText(display ?? inline ?? "")} `)
    .replace(/\s+/g, " ")
    .trim();
}

export const isIndexable = (plain: string) => plain.length >= MIN_INDEXABLE_CHARS;

export function slugify(text: string, maxWords = 9): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join("-")
    .slice(0, 70)
    .replace(/-+$/, "");
}

/**
 * Many PYQs open with the same stock wording ("Given below are two statements…",
 * "Match List-I with List-II…") or are mostly numbers/LaTeX. Titles and slugs
 * built from their first words would be near-identical across hundreds of
 * pages, which Google reads as duplicate/low-quality. For those we describe the
 * question by what it is + where it sits (chapter) instead. Returns that kind
 * (e.g. "Match the following"), or null when the text is distinctive enough to
 * use as it is.
 *
 * Uses only the question body, so the page and the sitemap always agree.
 */
export function stemKind(text: string): string | null {
  if (/^match\b/i.test(text)) return "Match the following";
  if (/^(given below are two statements|statement[\s-]*(i|1)\b|read the assertion|assertion\b)/i.test(text)) return "Statement-based question";
  // Short, generic stems ("Which of the following statements is correct").
  if (text.length < 70 && /^(which of the following|identify the|select the|choose the|consider the following|read the following)/i.test(text)) return "Question";
  // Mostly numbers / symbols / LaTeX debris: too few real words to name the page after.
  const words = text.split(/\s+/).map((w) => w.replace(/[.,?:;!]+$/, "")).filter((w) => /^[a-z]{3,}$/i.test(w));
  if (words.length < 4) return "Question";
  return null;
}

const whereOf = (subject: string, chapter: string) => {
  const c = chapter?.trim() || UNTAGGED_CHAPTER;
  return c === UNTAGGED_CHAPTER ? subject?.trim() || "" : c;
};

/** The `$id` segment of /question/$id, e.g. "a-particle-moves-along-the-x-axis-6710f0c2…". */
export function questionParam(q: { id: string; body: string; subject: string; chapter: string }): string {
  const where = whereOf(q.subject, q.chapter);
  const text = plainText(q.body);
  const kind = stemKind(text);
  // Distinctive question → its own words. Generic one → "<kind> <chapter>". Never depends on the paper label, so the sitemap (which has no label) builds the same url.
  const base = (kind ? slugify(`${kind} ${where}`) : slugify(text)) || slugify(`${where} pyq`) || "pyq";
  return `${base}-${q.id}`;
}

/** <title> text (before the " · Edurack" suffix): the question itself, or kind + chapter + paper for generic ones. */
export function questionTitle(q: { body: string; subject: string; chapter: string; label?: string }): string {
  const text = plainText(q.body);
  const kind = stemKind(text);
  if (!kind) return text;
  const where = whereOf(q.subject, q.chapter);
  return `${q.label ? `${q.label} ` : ""}${kind}: ${where}`.trim();
}

/** Pull the question id off the end of the url segment; null if it isn't there. */
export function parseQuestionParam(param: string): string | null {
  const m = /([a-f0-9]{24})$/i.exec(param);
  return m ? m[1].toLowerCase() : null;
}

export type PyqRelated = {
  /** `$id` segment of its own page. */
  param: string;
  snippet: string;
  label: string;
  difficulty: Difficulty;
  chapter: string;
  topic: string;
};

/** What the NEET blueprint says about this question's chapter and topic. Server-built, so the whole dataset never ships to the browser. */
export type PyqContext = {
  subjectKey: string;
  subjectName: string;
  chapterSlug: string;
  chapterName: string;
  chapterTotal: number;
  subjectTotal: number;
  share: number;
  rank: number;
  chapterCount: number;
  perPaperAvg: number;
  trend: "rising" | "steady" | "falling";
  recentAvg: number;
  earlierAvg: number;
  rangeLabel: string;
  paperCount: number;
  /** Null when the question has no topic tag or no blueprint row matches it. */
  topic: { name: string; total: number; papers: number } | null;
};

/** The questions just before and after this one in its chapter (indexable ones only). */
export type PyqAdjacent = { prev: PyqRelated | null; next: PyqRelated | null };

export type PyqPublicPage = {
  /** Never contains the answer or the solution. */
  question: PyqQuestion;
  examKey: ExamKey | null;
  /** The one correct `$id` segment for this question; any other spelling 301s to it. */
  canonical: string;
  indexable: boolean;
  related: PyqRelated[];
  context: PyqContext | null;
  adjacent: PyqAdjacent;
};

/** What a logged-out visitor gets back: the answer, never the solution. */
export type PublicCheckResult = {
  isCorrect: boolean;
  revealed: boolean;
  correctOption?: OptionKey;
  correctAnswer?: number;
  /** Whether a written solution exists, so the page can say "log in to see it" only when there is one. */
  hasSolution: boolean;
};

export const snippetOf = (body: string, max = 140) => truncate(plainText(body), max);


const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Plain sentences that say where this question sits — paper, difficulty, how
 * much weight its chapter carries and how often its topic repeats. Rendered in
 * the HTML so every question page has facts of its own, not just the stem.
 */
export function questionContextLines(q: PyqQuestion, ctx: PyqContext | null): string[] {
  const out: string[] = [];
  if (q.source.year) out.push(`Previous-year question from ${q.source.label}.`);
  out.push(`Tagged ${q.difficulty.toLowerCase()} difficulty.`);
  if (ctx) {
    out.push(
      `${ctx.chapterName} contributed ${ctx.chapterTotal} of the ${ctx.subjectTotal} NEET ${ctx.subjectName} questions asked between ${ctx.rangeLabel} ` +
        `(${ctx.share}% of the subject, #${ctx.rank} of ${ctx.chapterCount} chapters), roughly ${ctx.perPaperAvg} per paper.`,
    );
    if (ctx.topic) {
      out.push(`The topic “${ctx.topic.name}” came up in ${ctx.topic.papers} of ${ctx.paperCount} papers (${plural(ctx.topic.total, "question")}) in the same period.`);
    }
    if (ctx.trend !== "steady") {
      out.push(`The chapter is ${ctx.trend}: the latest three papers average ${ctx.recentAvg} questions each, against ${ctx.earlierAvg} in the first three.`);
    }
  }
  return out;
}

/**
 * schema.org Question for the page. Only what a visitor can see in the HTML is
 * marked up: the stem and the four options. The correct answer and the solution
 * are fetched after the visitor checks an answer / logs in, so there is
 * deliberately NO acceptedAnswer — marking up an answer the page doesn't show
 * would break Google's structured-data rules. (That also means this will not
 * produce a Q&A rich result; it describes the page to search engines.)
 */
export function questionJsonLd(q: PyqQuestion, url: string) {
  const text = plainText(q.body);
  const options = q.type === "mcq" && q.options ? (["A", "B", "C", "D"] as const).map((k) => plainText(q.options?.[k] ?? "")) : [];
  const allOptions = options.length === 4 && options.every(Boolean);
  const tagged = q.chapter !== UNTAGGED_CHAPTER;
  return {
    "@context": "https://schema.org",
    "@type": "Question",
    "@id": `${url}#question`,
    url,
    name: truncate(questionTitle({ body: q.body, subject: q.subject, chapter: q.chapter, label: q.source.label }), 110),
    text: truncate(text, 1000),
    inLanguage: "en-IN",
    eduQuestionType: q.type === "mcq" ? "Multiple choice" : "Numerical",
    about: [{ "@type": "Thing", name: q.subject }, ...(tagged ? [{ "@type": "Thing", name: q.chapter }] : [])],
    isPartOf: { "@type": "WebPage", "@id": url },
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(allOptions ? { suggestedAnswer: options.map((t) => ({ "@type": "Answer", text: truncate(t, 300) })) } : {}),
  };
}
