// Client-side counter for how many PYQs a logged-out visitor has tried, so the
// sign-up prompt appears after GUEST_PYQ_LIMIT questions across the whole site,
// not per chapter. localStorage can be blocked or empty (private windows), so
// every access is wrapped; without it the server's per-chapter cap still applies.
const KEY = "edurack-guest-pyq-count";

export function getGuestPyqCount(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function bumpGuestPyqCount(): number {
  const next = getGuestPyqCount() + 1;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // ignore: see note above
  }
  return next;
}
