// SERVER-ONLY. Never import this from a component or client-side file.

// FORCE GOOGLE AUTH LIBRARY TO USE NATIVE NODE FETCH BYPASSING THE BROKEN DEPENDENCY TREE
// This must execute at the absolute top before any Firebase classes load.
(globalThis as any).GaxiosUseNativeFetch = true;

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export const adminAuth = getAuth();