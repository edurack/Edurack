import { IconClock as Clock, IconUser as User } from "@tabler/icons-react";

const subjects = [
  { name: "Physics", active: false },
  { name: "Chemistry", active: false },
  { name: "Botany", active: true },
  { name: "Zoology", active: false },
];

const palette = [
  { n: 1, s: "answered" },
  { n: 2, s: "answered" },
  { n: 3, s: "review" },
  { n: 4, s: "not-answered" },
  { n: 5, s: "current" },
  { n: 6, s: "not-visited" },
  { n: 7, s: "answered" },
  { n: 8, s: "review-answered" },
  { n: 9, s: "not-answered" },
  { n: 10, s: "not-visited" },
  { n: 11, s: "not-visited" },
  { n: 12, s: "answered" },
  { n: 13, s: "not-visited" },
  { n: 14, s: "review" },
  { n: 15, s: "not-visited" },
];

const statusColor: Record<string, string> = {
  answered: "bg-green-500 text-white",
  "not-answered": "bg-red-500 text-white",
  review: "bg-purple-500 text-white",
  "review-answered": "bg-purple-600 text-white ring-2 ring-green-400",
  current: "bg-blue-600 text-white ring-4 ring-blue-200",
  "not-visited": "bg-white text-slate-700 border border-slate-300",
};

export function CbtSimulator() {
  return (
    <div className="clay mx-auto w-full max-w-6xl p-3 sm:p-5 md:p-7">
      <div className="overflow-hidden rounded-2xl bg-white shadow-inner ring-1 ring-slate-200">
        {/* Top header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img 
              src="https://www.edurack.in/edurack-logo.webp" 
              alt="Logo" 
              className="h-10 w-auto object-contain sm:h-12" 
              onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display='none'}} 
            />
            <div className="text-sm font-semibold text-slate-800 sm:text-base">NEET (UG) — Mock Test 07</div>
          </div>
          <div className="flex items-center gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-slate-700">
              <Clock className="h-4 w-4" />
              <span className="font-mono font-semibold">02:47:12</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-sky-700">
                <User className="h-4 w-4" />
              </div>
              <span className="font-medium text-slate-700">Aarav S.</span>
            </div>
          </div>
        </div>

        {/* Orange subject nav */}
        <div className="flex flex-wrap gap-2 bg-orange-500 px-3 py-2 sm:px-5">
          {subjects.map((s) => (
            <button
              key={s.name}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                s.active ? "bg-white text-orange-600" : "bg-orange-400/60 text-white hover:bg-orange-400"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Main grid: question + palette */}
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* Question panel */}
          <div className="min-w-0 p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Question No. 5</span>
              <div className="flex gap-3">
                <span>Marks: <b className="text-green-600">+4</b></span>
                <span>Negative: <b className="text-red-600">-1</b></span>
              </div>
            </div>
            <h4 className="mb-4 text-base font-semibold text-slate-800 sm:text-lg">
              Which of the following plant tissues is responsible for secondary growth in dicot stems?
            </h4>
            <div className="space-y-2.5">
              {["Vascular cambium", "Cork cambium", "Both A and B", "Apical meristem"].map((opt, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-slate-300 bg-white text-xs font-semibold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white sm:text-sm">Save & Next</button>
              <button className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white sm:text-sm">Mark for Review</button>
              <button className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:text-sm">Clear</button>
            </div>
          </div>

          {/* Palette */}
          <aside className="border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Question Palette</div>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-5">
              {palette.map((q) => (
                <button
                  key={q.n}
                  className={`grid aspect-square place-items-center rounded-md text-xs font-bold ${statusColor[q.s]}`}
                >
                  {q.n}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 text-[11px] text-slate-600">
              <Legend color="bg-green-500" label="Answered" />
              <Legend color="bg-red-500" label="Not Answered" />
              <Legend color="bg-purple-500" label="Marked for Review" />
              <Legend color="bg-white border border-slate-300" label="Not Visited" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded ${color}`} />
      {label}
    </div>
  );
}