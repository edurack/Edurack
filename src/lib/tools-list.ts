// The free tools, in the order they are listed on the homepage, the /tools hub and under each tool. One place to add a tool.
// (Kept in its own file so the homepage can list the tools without loading the tool pages' shell.)
export const TOOLS = [
  { to: "/tools/neet-rank-predictor", name: "NEET Rank Predictor", blurb: "Marks to expected AIR, using the last three years of NTA data.", emoji: "🎯" },
  { to: "/tools/neet-percentile-calculator", name: "NEET Percentile Calculator", blurb: "Turn your marks or rank into a percentile.", emoji: "📊" },
  { to: "/tools/neet-target-score-planner", name: "NEET Target Score Planner", blurb: "How many questions to attempt, and how accurately, for your target.", emoji: "🧭" },
  { to: "/tools/jee-main-percentile-calculator", name: "JEE Main Percentile to Rank", blurb: "Turn your NTA percentile into an expected AIR, and back.", emoji: "🧮" },
  { to: "/tools/jee-main-countdown", name: "JEE Main 2027 Countdown and Planner", blurb: "Days left with NTA-official dates, and a day-by-day study plan.", emoji: "⏳" },
  { to: "/tools/neet-countdown", name: "NEET UG 2027 Countdown and Planner", blurb: "Days left to a planning date, and a day-by-day study plan.", emoji: "🗓️" },
] as const;
