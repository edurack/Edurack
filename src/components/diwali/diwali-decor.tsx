import { useId, type CSSProperties } from "react";

// Pure decoration: every element here is aria-hidden and pointer-events:none, so it can never block a click
// or be read out by a screen reader. All motion is switched off for prefers-reduced-motion in styles.css.

const BULB_COLORS = ["#ffb52e", "#ff7a1a", "#ffd978", "#ff5a2b", "#ffc94d"];
const TILE_COUNT = 30; // 30 × 100px = 3000px of swags, clipped to the viewport

/** A string of fairy lights hanging in swags along the very top edge of the screen. */
export function DiwaliGarland() {
  return (
    <div aria-hidden="true" className="dw-garland">
      <div className="dw-garland-row">
        {Array.from({ length: TILE_COUNT }, (_, t) => (
          <div className="dw-tile" key={t}>
            {[
              [25, 6.2],
              [50, 8],
              [75, 6.2],
            ].map(([x, y], i) => {
              const n = t * 3 + i;
              return (
                <span
                  key={i}
                  className="dw-bulb"
                  style={{ left: x, top: y, "--c": BULB_COLORS[n % BULB_COLORS.length], "--d": `${(n * 0.37) % 2.6}s` } as CSSProperties}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A small flickering diya. */
export function Diya({ className = "" }: { className?: string }) {
  // Unique gradient ids per instance: a gradient defined inside a display:none <svg> (the corner diyas are hidden
  // on small screens) does not resolve for other <svg>s that share its id, which left the bowl unpainted.
  const uid = useId().replace(/:/g, "");
  const bowl = `dw-bowl-${uid}`;
  const fl = `dw-fl-${uid}`;
  return (
    <svg aria-hidden="true" viewBox="0 0 80 64" className={className} focusable="false">
      <defs>
        <linearGradient id={bowl} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset=".5" stopColor="#e0a43a" />
          <stop offset="1" stopColor="#8d5513" />
        </linearGradient>
        <radialGradient id={fl} cx=".5" cy=".7" r=".6">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset=".45" stopColor="#ffc24a" />
          <stop offset="1" stopColor="#ff6a14" />
        </radialGradient>
      </defs>
      <ellipse className="dw-flame-halo" cx="40" cy="22" rx="26" ry="22" fill="#ff9a2e" opacity=".28" />
      <path className="dw-flame" d="M40 4c6 8 9 13 6 19-1.6 3.2-4.4 4.6-6 4.6s-4.4-1.4-6-4.6c-3-6 0-11 6-19z" fill={`url(#${fl})`} />
      <path d="M6 32h68c0 14-14 26-34 26S6 46 6 32z" fill={`url(#${bowl})`} />
      <path d="M6 32h68" stroke="#fff1c2" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path d="M22 44c6 6 30 6 36 0" stroke="#7a4710" strokeWidth="1.4" fill="none" opacity=".5" strokeLinecap="round" />
    </svg>
  );
}

// x%, y%, size px, delay s. A handful of crisp four-point stars, not dust: they only live on the dark surfaces.
const SPARKS: [number, number, number, number][] = [
  [7, 16, 16, 0],
  [90, 10, 12, 1.1],
  [19, 74, 11, 0.5],
  [78, 62, 18, 1.7],
  [52, 28, 9, 2.2],
  [95, 86, 12, 0.9],
  [4, 52, 10, 2.8],
];
export function Sparkles({ count = SPARKS.length }: { count?: number }) {
  return (
    <div aria-hidden="true" className="dw-sparks">
      {SPARKS.slice(0, count).map(([x, y, s, d], i) => (
        <span key={i} className="dw-spark" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${d}s` }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false">
            <path d="M12 0c.9 6.8 5.2 11.1 12 12-6.8.9-11.1 5.2-12 12-.9-6.8-5.2-11.1-12-12C6.8 11.1 11.1 6.8 12 0z" fill="#ffe9a8" />
          </svg>
        </span>
      ))}
    </div>
  );
}

/** A gold marquee tape: "DIWALI SALE ✦ FLAT 50% OFF ✦ ALL PRO PLANS ✦" sliding past. */
export function Tape({ percent, className = "" }: { percent: number; className?: string }) {
  const unit = `Diwali sale ✦ Flat ${percent}% off ✦ All Pro plans ✦ `;
  return (
    <div aria-hidden="true" className={`dw-tape ${className}`}>
      <div className="dw-tape-track">
        {[0, 1].map((k) => (
          <div className="dw-tape-set" key={k}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i}>{unit}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
