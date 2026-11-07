// Public (indexable) NCERT Line-by-Line question pages: /ncert/<slug>-<id>
//
// Pure — no server imports — so the route, the server function and the sitemap all build the SAME url for a question.
// Same idea as lib/pyq-public.ts: the slug is only for humans and search engines; the 24-char ObjectId at the end is what
// we look the question up by, so an edited slug never breaks a link (the page 301s to the current one).
//
// These pages exist ONLY while the NCERT section is "live" (see ncert-public-server.ts). They show the question and its
// options and nothing else: no answer, no solution.
import { isIndexable, plainText, slugify, stemKind } from "@/lib/pyq-public";
import { SITE_URL, truncate } from "@/lib/seo";
import type { NcertQuestion } from "@/lib/ncert-line-types";

export type NcertPublicQuestion = Omit<NcertQuestion, "status">;
export type NcertRelated = { param: string; snippet: string; chapter: string; topic: string; difficulty: string };
export type NcertPublicPage = {
  question: NcertPublicQuestion;
  /** The one canonical `$id` segment for this question. */
  canonical: string;
  /** false → the page is served but marked noindex (image-only / too little text). */
  indexable: boolean;
  related: NcertRelated[];
  adjacent: { prev: NcertRelated | null; next: NcertRelated | null };
};

const whereOf = (q: { subject: string; chapter: string }) => q.chapter?.trim() || q.subject?.trim() || "";

/** The `$id` segment of /ncert/$id, e.g. "a-particle-moves-along-the-x-axis-6710f0c2…". */
export function ncertQuestionParam(q: { id: string; body: string; subject: string; chapter: string }): string {
  const where = whereOf(q);
  const text = plainText(q.body);
  const kind = stemKind(text);
  // Generic stems get "<kind> <chapter>" so hundreds of look-alike pages don't share a title.
  const base = (kind ? slugify(`${kind} ${where}`) : slugify(text)) || slugify(`ncert ${where}`) || "ncert-question";
  return `${base}-${q.id}`;
}

/** Pull the question id off the end of the url segment; null if it isn't there. */
export function parseNcertParam(param: string): string | null {
  const m = /([a-f0-9]{24})$/i.exec(param);
  return m ? m[1].toLowerCase() : null;
}

/** <title> text (before the " · Edurack" suffix). */
export function ncertQuestionTitle(q: { body: string; subject: string; chapter: string }): string {
  const text = plainText(q.body);
  const kind = stemKind(text);
  return kind ? `${kind}: ${whereOf(q)} (NCERT ${q.subject})` : text;
}

export const ncertSnippet = (body: string, max = 140) => truncate(plainText(body), max);

/** Is there enough readable text for Google? (SVG diagrams, images and LaTeX markup do not count.) */
export const isNcertIndexable = (q: { body: string }) => isIndexable(plainText(q.body));

/** Plain sentences that say where the question sits, so every page has facts of its own. */
export function ncertContextLines(q: NcertPublicQuestion): string[] {
  return [
    `From the Edurack NCERT Line by Line bank: Class ${q.classLevel} ${q.subject}, chapter "${q.chapter}", topic "${q.topic}".`,
    `Tagged ${q.difficulty.toLowerCase()} difficulty.`,
    q.type === "mcq" ? "Multiple choice, one correct option." : "Numerical answer type.",
  ];
}

/**
 * schema.org Question. Only what a visitor can see is marked up: the stem and the options. The answer and solution are
 * not in the page, so there is deliberately NO acceptedAnswer.
 */
export function ncertJsonLd(q: NcertPublicQuestion, url: string) {
  const text = plainText(q.body);
  const options = q.type === "mcq" && q.options ? (["A", "B", "C", "D"] as const).map((k) => plainText(q.options?.[k] ?? "")) : [];
  const allOptions = options.length === 4 && options.every(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Question",
    "@id": `${url}#question`,
    url,
    name: truncate(ncertQuestionTitle(q), 110),
    text: truncate(text, 1000),
    inLanguage: "en-IN",
    eduQuestionType: q.type === "mcq" ? "Multiple choice" : "Numerical",
    about: [{ "@type": "Thing", name: q.subject }, { "@type": "Thing", name: q.chapter }],
    isPartOf: { "@type": "WebPage", "@id": url },
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(allOptions ? { suggestedAnswer: options.map((t) => ({ "@type": "Answer", text: truncate(t, 300) })) } : {}),
  };
}
