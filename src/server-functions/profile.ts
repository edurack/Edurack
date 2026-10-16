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

    await db.collection("profiles").updateOne(
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

    return { ok: true };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string; profile: OnboardingProfileInput }) => data)
  .handler(async ({ data }) => {
    const decoded = await adminAuth.verifyIdToken(data.token);
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