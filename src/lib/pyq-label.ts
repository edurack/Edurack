// Builds the "JEE MAINS 2022 29 JUNE SHIFT 2" style source line shown on every
// PYQ. Questions only store `pyqYear`; the full paper name already lives on the
// batch (bundle title) and/or the test name that contains the question, so we
// read it from there instead of making admins type it again on every question.
//
// Pure + dependency-free so it can be unit-tested and used on server and client.

export type PyqSource = {
  /** Full display line, e.g. "JEE Mains 2022 29 June Shift 2". Style with `uppercase`. */
  label: string;
  exam: string | null;
  year: string | null;
  /** e.g. "29 June" */
  date: string | null;
  /** e.g. "Shift 2" */
  shift: string | null;
};

const EXAM_KEY_LABELS: Record<string, string> = { neet: "NEET", jee: "JEE", cuet: "CUET", ipmat: "IPMAT" };

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const SHIFT_RE = /\bshift\s*[-:#]?\s*(\d+)\b/i;
const DATE_RE = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i");
const EXAM_RE = /\b(?:JEE\s*(?:Mains?|Advanced)|NEET(?:\s*UG)?|CUET|IPMAT|BITSAT|WBJEE|MHT[\s-]?CET)\b/i;
const GENERIC_RE = /\b(?:PYQs?|previous\s+years?(?:'s)?\s+(?:questions?|papers?)|question\s+papers?|papers?)\b/gi;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const stripGeneric = (s: string) => clean(s.replace(GENERIC_RE, " "));
const hasYear = (s: string) => YEAR_RE.test(s);
const hasShiftOrDate = (s: string) => SHIFT_RE.test(s) || DATE_RE.test(s);

export function buildPyqSource(input: {
  bundleTitle?: string | null;
  testName?: string | null;
  pyqYear?: string | null;
  examKey?: string | null;
}): PyqSource {
  const b = clean(input.bundleTitle);
  const t = clean(input.testName);
  const examFromKey = input.examKey ? EXAM_KEY_LABELS[input.examKey] ?? null : null;

  let label: string;
  if (hasShiftOrDate(b)) {
    // Batch title is already the full paper name: "JEE Mains 2022 29 June Shift 2".
    label = b;
  } else if (hasShiftOrDate(t)) {
    // Shift/date live on the test; borrow the exam (and year) from the batch.
    label = hasYear(t) && EXAM_RE.test(t) ? t : clean(`${stripGeneric(b)} ${t}`);
  } else if (hasYear(b)) {
    label = b;
  } else if (hasYear(t)) {
    label = t;
  } else {
    label = b || t;
  }

  // Test name carried the year but not the exam ("Paper 2019") — take the exam from the batch.
  if (label && !EXAM_RE.test(label)) {
    const examInBatch = b.match(EXAM_RE)?.[0];
    if (examInBatch) label = clean(`${examInBatch} ${stripGeneric(label)}`);
  }

  const pyqYear = clean(input.pyqYear).match(YEAR_RE)?.[0] ?? null;
  const year = pyqYear ?? label.match(YEAR_RE)?.[0] ?? null;

  if (!label) label = year ? `PYQ ${year}` : "Previous Year Question";
  else if (!hasYear(label) && year) label = `${label} ${year}`;

  const shiftMatch = label.match(SHIFT_RE);
  return {
    label,
    exam: label.match(EXAM_RE)?.[0]?.replace(/\s+/g, " ") ?? examFromKey,
    year,
    date: label.match(DATE_RE)?.[0] ?? null,
    shift: shiftMatch ? `Shift ${shiftMatch[1]}` : null,
  };
}
