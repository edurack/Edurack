// Sample (illustrative) data for the landing page's exam-aware demos: the hero phone,
// the embedded CBT simulator and the sample performance report all read from here,
// so switching exam changes every demo consistently. Not real student data.
export type DemoExam = "neet" | "jee" | "cuet" | "ipmat";
// Exams that are live today (hero chips, simulator tabs). CUET and IPMAT demo data is kept ready for launch:
// add the key here, and drop its "coming soon" markers on the homepage, when it goes live.
export const DEMO_EXAM_KEYS: DemoExam[] = ["neet", "jee"];

export type ExamDemo = {
  label: string;
  short: string;
  mockTitle: string;
  score: number;
  total: number;
  report: { s: string; v: number }[];
  focus: string[];
  sections: string[];
  activeSection: number;
  marks: { plus: number; minus: number };
  question: string;
  options: string[];
};

export const EXAM_DEMOS: Record<DemoExam, ExamDemo> = {
  neet: {
    label: "NEET",
    short: "NEET (UG)",
    mockTitle: "NEET (UG) — Mock Test 07",
    score: 400,
    total: 720,
    report: [{ s: "Physics", v: 46 }, { s: "Chemistry", v: 78 }, { s: "Biology", v: 61 }],
    focus: ["Physics → Mechanics", "Biology → Plant Physiology"],
    sections: ["Physics", "Chemistry", "Botany", "Zoology"],
    activeSection: 2,
    marks: { plus: 4, minus: 1 },
    question: "Which of the following plant tissues is responsible for secondary growth in dicot stems?",
    options: ["Vascular cambium", "Cork cambium", "Both A and B", "Apical meristem"],
  },
  jee: {
    label: "JEE",
    short: "JEE Main",
    mockTitle: "JEE Main — Mock Test 07",
    score: 168,
    total: 300,
    report: [{ s: "Physics", v: 44 }, { s: "Chemistry", v: 74 }, { s: "Maths", v: 63 }],
    focus: ["Physics → Rotational Motion", "Maths → Coordinate Geometry"],
    sections: ["Physics", "Chemistry", "Maths"],
    activeSection: 2,
    marks: { plus: 4, minus: 1 },
    question: "What is the value of the definite integral of sin x from 0 to π?",
    options: ["0", "1", "2", "π"],
  },
  cuet: {
    label: "CUET",
    short: "CUET (UG)",
    mockTitle: "CUET (UG) — Mock Test 07",
    score: 160,
    total: 250,
    report: [{ s: "English", v: 80 }, { s: "General Test", v: 58 }, { s: "Domain Subject", v: 45 }],
    focus: ["Domain Subject → Unit 3", "General Test → Quantitative Reasoning"],
    sections: ["English", "Domain Subject", "General Test"],
    activeSection: 2,
    marks: { plus: 5, minus: 1 },
    question: "Find the next number in the series: 2, 6, 12, 20, 30, ?",
    options: ["36", "40", "42", "48"],
  },
  ipmat: {
    label: "IPMAT",
    short: "IPMAT",
    mockTitle: "IPMAT — Mock Test 07",
    score: 240,
    total: 400,
    report: [{ s: "Quantitative Ability", v: 48 }, { s: "Verbal Ability", v: 72 }],
    focus: ["Quant → Number Systems", "Quant → Algebra"],
    sections: ["Quantitative Ability", "Verbal Ability"],
    activeSection: 0,
    marks: { plus: 4, minus: 1 },
    question: "If x + 1/x = 3, what is the value of x² + 1/x²?",
    options: ["5", "7", "9", "11"],
  },
};

/** Sample-report tone for a section score. */
export function toneOf(v: number): { word: string; text: string; bar: string } {
  if (v < 50) return { word: "Needs attention", text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" };
  if (v >= 70) return { word: "Strong", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
  return { word: "Moderate", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" };
}
