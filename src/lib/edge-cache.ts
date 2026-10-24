// Edge-cache policy for public, anonymous HTML pages.
//
// Why this is safe here: auth is client-side (Firebase), no SSR loader reads a
// cookie or identity, and the blog view counter is a client POST, so the HTML
// for these paths is identical for every visitor.
//
// `max-age=0` keeps browsers revalidating; only the CDN (Vercel) holds the page
// for `s-maxage` and serves it stale while refreshing in the background.
//
// NEVER add a path whose loader depends on who is asking.

const swr = (sMaxAge: number, stale: number) =>
  `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${stale}`;

const HOUR = swr(3600, 86400);
const SHORT = swr(300, 86400); // content that an admin edits (blog)
const DAILY = swr(300, 600); // changes at midnight (question of the day)
// The JEE Main 2027 hub shows published articles and resources, so a pulled item must disappear quickly:
// a minute at the CDN, and at most a minute of stale-while-revalidate.
const LIVE = swr(60, 60);

/** Cache-Control for a public page path, or null when the path must not be edge-cached. */
export function edgeCachePolicy(pathname: string): string | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (p === "/neet/question-of-the-day") return DAILY;
  if (p === "/jee-main-2027") return LIVE;
  if (p === "/blog" || p.startsWith("/blog/")) return SHORT;
  if (p === "/free-resources") return swr(600, 86400);
  if (p.startsWith("/question/")) return HOUR;
  if (p.startsWith("/neet/")) return HOUR;
  if (p === "/tools" || p.startsWith("/tools/")) return HOUR;
  if (p === "/pyq") return HOUR;
  if (p === "/about" || p === "/faq" || p === "/help" || p === "/contact") return HOUR;
  if (p.startsWith("/legal/")) return HOUR;
  return null; // home ("/") is streamed with deferred data: left out on purpose
}
