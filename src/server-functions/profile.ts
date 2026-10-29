import { createServerFn } from "@tanstack/react-start";
import { adminAuth } from "@/lib/firebase-admin";
import { getDb } from "@/lib/mongo";
import { loadProfile } from "@/lib/dashboard-core";

type OnboardingProfileInput = {
  fullName: string;
  mobile: string;
  city: string;
  currentClass: string;
  board: string;
  targetExam: string;
  track: "Dropper" | "11th" | "12th" | "";
  cuetDomainSubjects: string[];
  /** The year they plan to sit the exam (e.g. 2027). Optional: collected on the dashboard, not at sign-up. */
  targetYear?: number | null;
};

const EMPTY_ONBOARDING_FIELDS: OnboardingProfileInput = {
  fullName: "",
  mobile: "",
  city: "",
  currentClass: "",
  board: "",
  targetExam: "",
  track: "",
  cuetDomainSubjects: [],
};

// Called right after ANY successful sign-in or sign-up (email/password or
// Google) so a MongoDB document always exists for the user, with empty
// onboarding fields if they haven't filled them in yet. Uses $setOnInsert
// so it never clobbers onboarding data that's already been saved.
export const ensureUserRecord = createServerFn({ method: "POST" })
  .validator((data: { token: string; provider: "password" | "google.com" }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    const now = new Date();

    const res = await db.collection("profiles").updateOne(
      { uid: decoded.uid },
      {
        $set: {
          uid: decoded.uid,
          email: decoded.email ?? null,
          provider: data.provider,
          updatedAt: now,
          lastLoginAt: now,
        },
        $setOnInsert: {
          ...EMPTY_ONBOARDING_FIELDS,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    // isNew is true exactly once per account (the call that created the profile). The client uses it to send
    // `signup_completed` once, instead of guessing from "onboarding still incomplete" (which repeats on every
    // login until onboarding is finished).
    return { ok: true, isNew: res.upsertedCount > 0 };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string; profile: OnboardingProfileInput }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    // A real Indian mobile number is required to finish sign-up (the client enforces it too).
    if (!/^[6-9]\d{9}$/.test(data.profile.mobile ?? "")) throw new Error("Enter a valid 10-digit mobile number.");
    const db = await getDb();
    await db.collection("profiles").updateOne(
      { uid: decoded.uid },
      {
        $set: {
          ...data.profile,
          uid: decoded.uid,
          email: decoded.email ?? null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    return { ok: true };
  });

// Used by the Profile page's inline-editable fields — patches only name/
// mobile/city without touching academic fields, avoiding any risk of
// clobbering currentClass/board/track with stale client-side state.
export const updateBasicInfo = createServerFn({ method: "POST" })
  .validator((data: { token: string; field: "fullName" | "mobile" | "city"; value: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    if (data.field === "mobile" && !/^[6-9]\d{9}$/.test(data.value)) throw new Error("Enter a valid 10-digit mobile number.");
    const db = await getDb();
    await db.collection("profiles").updateOne(
      { uid: decoded.uid },
      { $set: { [data.field]: data.value, updatedAt: new Date() } },
      { upsert: true },
    );
    return { ok: true };
  });

// Lets a student change their academic placement after onboarding (class
// moved up a year, board changed, or track corrected) without touching
// name/contact fields. Kept separate from updateBasicInfo for the same
// clobbering-avoidance reason documented above.
export const updateAcademicInfo = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      currentClass: string;
      board: string;
      track: "Dropper" | "11th" | "12th" | "";
    }) => data,
  )
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    await db.collection("profiles").updateOne(
      { uid: decoded.uid },
      {
        $set: {
          currentClass: data.currentClass,
          board: data.board,
          track: data.track,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return { ok: true };
  });

// Fills in the prep details onboarding doesn't ask for (target year) or that an older account never set
// (exam, class/track). Only the fields that are sent are written, and they are validated here, so this can't be
// used to blank out or corrupt anything else on the profile.
const CLASS_FOR_TRACK = { "11th": "Class 11", "12th": "Class 12", Dropper: "Dropper" } as const;
export const updatePrepInfo = createServerFn({ method: "POST" })
  .validator((data: { token: string; targetExam?: "neet" | "jee"; track?: "11th" | "12th" | "Dropper"; targetYear?: number }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const set: Record<string, unknown> = {};
    if (data.targetExam !== undefined) {
      if (data.targetExam !== "neet" && data.targetExam !== "jee") throw new Error("Pick NEET or JEE.");
      set.targetExam = data.targetExam;
    }
    if (data.track !== undefined) {
      if (!(data.track in CLASS_FOR_TRACK)) throw new Error("Pick 11th, 12th or Dropper.");
      set.track = data.track;
      set.currentClass = CLASS_FOR_TRACK[data.track];
    }
    if (data.targetYear !== undefined) {
      const thisYear = new Date().getFullYear();
      if (!Number.isInteger(data.targetYear) || data.targetYear < thisYear || data.targetYear > thisYear + 6) throw new Error("Pick a valid target year.");
      set.targetYear = data.targetYear;
    }
    if (Object.keys(set).length === 0) return { ok: true };
    const db = await getDb();
    await db.collection("profiles").updateOne({ uid: decoded.uid }, { $set: { ...set, updatedAt: new Date() } }, { upsert: true });
    return { ok: true };
  });

export const getProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
    const db = await getDb();
    return loadProfile(db, decoded.uid);
  });

// True when the user still needs to go through onboarding (no full name saved yet).
export function needsOnboarding(profile: { fullName?: string } | null): boolean {
  return !profile?.fullName?.trim();
}