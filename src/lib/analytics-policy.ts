// Which pages analytics may look at. Pure, so it can be tested without a browser.
//
// Edurack's students are often teenagers, and some pages show other people's personal data or contain
// links that shouldn't be copied around. Two tiers:
//   NO_CAPTURE: nothing is sent at all (staff/mentor/partner portals and mentor onboarding, which holds documents).
//   NO_REPLAY : normal events are fine, but the screen is never recorded (sign-in, profile, purchases,
//               booked sessions with their join links, support tickets, private notes, application forms).
export const NO_CAPTURE_PREFIXES = ["/admin", "/promoter", "/intern", "/mentor/dashboard", "/mentor-onboarding"] as const;
export const NO_REPLAY_PREFIXES = ["/auth", "/login", "/forgot-password", "/profile", "/purchases", "/my-sessions", "/tickets", "/notebook", "/join-mentor", "/join-intern"] as const;

const matches = (path: string, prefixes: readonly string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/** May analytics record events on this path? */
export const captureAllowed = (path: string) => !matches(path, NO_CAPTURE_PREFIXES);
/** May the screen be recorded on this path? (Implies captureAllowed.) */
export const replayAllowed = (path: string) => captureAllowed(path) && !matches(path, NO_REPLAY_PREFIXES);
