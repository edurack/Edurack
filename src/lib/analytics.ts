// Product analytics with PostHog: funnels, session replay and error tracking.
//
// - Does NOTHING until VITE_PUBLIC_POSTHOG_KEY is set, so this is safe to deploy before the account exists.
// - Honours the browser's Do Not Track setting (same as the existing funnel tracker in funnel-events.ts).
// - Students are identified by their account id only: no name, email or phone is ever sent.
// - Every form field is masked in replays, and pages in analytics-policy.ts are excluded or never recorded.
// - Loaded lazily after the page is interactive, so it doesn't slow first paint.
//
// Env: VITE_PUBLIC_POSTHOG_KEY (the project API key; it is public by design)
//      VITE_PUBLIC_POSTHOG_HOST (optional; default https://us.i.posthog.com, use https://eu.i.posthog.com for the EU cloud)
import type { PostHog } from "posthog-js";
import { captureAllowed, replayAllowed } from "@/lib/analytics-policy";

type Props = Record<string, string | number | boolean | null | undefined>;

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let ph: PostHog | null = null;
let started = false;
let lastPath: string | null = null;
let identifiedUid: string | null = null;
const queue: Array<(p: PostHog) => void> = [];

const enabled = () => typeof window !== "undefined" && Boolean(KEY) && navigator.doNotTrack !== "1";
const run = (fn: (p: PostHog) => void) => {
  if (ph) fn(ph);
  else if (started) queue.push(fn); // init is still loading: replay these once it's ready
};

/** Start analytics once per page load. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (started || !enabled()) return;
  started = true;
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY as string, {
        api_host: HOST,
        person_profiles: "identified_only", // anonymous visitors stay anonymous (and cheaper)
        capture_pageview: false, // this is a single-page app: pageviews are sent on route change below
        capture_pageleave: true,
        autocapture: false, // only the deliberate events in this file, so the numbers stay clean
        respect_dnt: true,
        capture_exceptions: true, // unhandled errors show up in PostHog's error tracking
        session_recording: { maskAllInputs: true, blockSelector: "[data-ph-block]" },
        // Last line of defence: even if some code tries to send an event from a private page, drop it.
        before_send: (event) => (event && !captureAllowed(window.location.pathname) ? null : event),
      });
      ph = posthog;
      for (const fn of queue.splice(0)) fn(posthog);
    })
    .catch(() => {
      // blocked by an ad blocker or offline: analytics must never break the app
      started = false;
    });
}

/** Call on every route change. Sends the pageview and turns screen recording on/off for that page. */
export function trackPageview(path: string): void {
  if (!enabled() || path === lastPath) return;
  lastPath = path;
  run((p) => {
    if (!captureAllowed(path)) {
      p.stopSessionRecording();
      return;
    }
    if (replayAllowed(path)) {
      if (!p.sessionRecordingStarted()) p.startSessionRecording();
    } else {
      p.stopSessionRecording();
    }
    p.capture("$pageview");
  });
}

/** Tie events to the signed-in student (by id only). Pass null on sign-out. */
export function identifyUser(uid: string | null): void {
  if (!enabled()) return;
  if (uid && uid !== identifiedUid) {
    identifiedUid = uid;
    run((p) => p.identify(uid));
  } else if (!uid && identifiedUid) {
    identifiedUid = null;
    run((p) => p.reset()); // a shared computer shouldn't carry one student's identity to the next
  }
}

/** Record a product event. Never throws; never blocks. Keep property values free of personal data. */
export function track(event: string, props: Props = {}): void {
  if (!enabled() || !captureAllowed(window.location.pathname)) return;
  try {
    run((p) => p.capture(event, props));
  } catch {
    // analytics must never break the page
  }
}

/** Send a caught error to PostHog's error tracking. */
export function reportError(error: unknown): void {
  if (!enabled()) return;
  run((p) => (p as unknown as { captureException?: (e: unknown) => void }).captureException?.(error));
}
