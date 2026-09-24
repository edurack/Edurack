import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

// ROOT FIX for the "student /auth page shows someone else's unverified
// account" bug: admin sign-in previously shared the exact same Firebase
// Auth instance (and therefore the exact same browser-persisted session)
// as the student-facing /auth page in src/lib/firebase.ts. Signing into
// admin with an unverified password account meant *any* later visit to
// /auth on that browser would inherit that admin session and get stuck on
// "verify your email" for an account they never personally used.
//
// Fix: initialize a SEPARATE named Firebase App instance for admin. Each
// named app gets its own isolated auth state / storage namespace, so an
// admin session here can never be read by the student-facing `auth` in
// firebase.ts, and vice versa — even on the same browser, same tab.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "auth.edurack.in",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const ADMIN_APP_NAME = "admin";

const adminApp =
  getApps().find((a) => a.name === ADMIN_APP_NAME) ??
  initializeApp(firebaseConfig, ADMIN_APP_NAME);

export const adminAuthClient = getAuth(adminApp);

if (typeof window !== "undefined") {
  void setPersistence(adminAuthClient, browserLocalPersistence);
}

export async function adminFirebaseSignIn(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(adminAuthClient, email, password);
  return { uid: cred.user.uid, token: await cred.user.getIdToken() };
}

export async function adminFirebaseSignUp(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(adminAuthClient, email, password);
  return { uid: cred.user.uid, token: await cred.user.getIdToken() };
}

export async function adminSignOutUser() {
  await signOut(adminAuthClient);
}