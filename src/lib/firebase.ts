import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Always use the native Firebase auth domain to bypass browser cross-origin storage partitioning
  authDomain: "edurackin.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Guard against re-initializing during HMR
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicit local persistence
if (typeof window !== "undefined") {
  void setPersistence(auth, browserLocalPersistence);
}

const googleProvider = new GoogleAuthProvider();

export async function firebaseSignIn(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return { uid: cred.user.uid, token: await cred.user.getIdToken() };
}

export async function firebaseSignUp(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return { uid: cred.user.uid, token: await cred.user.getIdToken() };
}

export async function googleAuth() {
  const cred = await signInWithPopup(auth, googleProvider);
  const isNew =
    cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime;
  return { uid: cred.user.uid, token: await cred.user.getIdToken(), isNew };
}

export async function signOutUser() {
  await signOut(auth);
}