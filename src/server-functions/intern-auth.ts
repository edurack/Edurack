// Intern authentication — mirrors promoter-auth.ts exactly: no Firebase
// Auth, admin issues an invite (secretCode), candidate self-serves a
// username + password against it, session is a stateless HMAC token.
// Lives in its own "interns" Mongo collection, own session secret
// (INTERN_SESSION_SECRET) — fully isolated from mentors/promoters, same
// isolation rule those two systems already hold with each other.
//
// Unlike promoter-auth.ts, requireIntern IS exported here (dynamic
// node:crypto import throughout, same as mentor-auth.ts) — intern-portal.ts
// needs it cross-file. mentor-auth.ts's comment explains why dynamic
// import + export is the safe combination and static-import + export is
// not (it drags node:crypto into the client bundle).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { adminAuth } from "@/lib/firebase-admin";
import type { InternSignUpInput } from "@/lib/intern-types";
import { sendMail } from "@/lib/mailer";
import {
  internInviteEmailHtml,
  internDatesConfirmedEmailHtml,
  internOfferLetterEmailHtml,
  internCertificateEmailHtml,
} from "@/lib/intern-email-templates";
import type { InternshipDatesInput, SetOfferLetterInput, SetCertificateInput } from "@/lib/intern-types";

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const { scryptSync, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { scryptSync, timingSafeEqual } = await import("node:crypto");
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function getSessionSecret(): string {
  const secret = process.env.INTERN_SESSION_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: INTERN_SESSION_SECRET is not set");
  }
  return secret;
}

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days, same as mentors/promoters

async function signInternToken(internId: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const secret = getSessionSecret();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${internId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

async function verifyInternToken(token: string): Promise<{ internId: string } | null> {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [internId, expiresAtStr, signature] = parts;

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expectedSignature = createHmac("sha256", secret)
    .update(`${internId}.${expiresAtStr}`)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  if (Date.now() > Number(expiresAtStr)) return null;

  return { internId };
}

// Choke point every intern-facing server function routes through. Hits the
// DB on every call (not purely stateless) so a suspended intern's token
// stops working on the very next request — same reasoning as
// requireMentor in mentor-auth.ts.
export async function requireIntern(token: string): Promise<string> {
  const verified = await verifyInternToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const intern = await db
    .collection("interns")
    .findOne({ _id: new ObjectId(verified.internId) }, { projection: { status: 1 } });
  if (!intern || intern.status === "suspended") {
    throw new Error("This account has been deactivated. Please contact Edurack.");
  }
  return verified.internId;
}

// Duplicated (not imported) from admin.ts's requireAdmin, same convention
// mentor-auth.ts and promoter-auth.ts already follow — keeps each identity
// file independent.
async function requireSuperAdmin(token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) {
    throw new Error("Forbidden: admin access required");
  }
  return decoded;
}

// ─── Admin: issue an invite ─────────────────────────────────────────────
// Creates an "invited" intern record with a generated secret code, then
// emails the candidate the code and the signup link directly — same
// best-effort pattern as approveCreatorApplication in admin.ts: the
// invite row is already saved, so a mail failure never rolls it back,
// it's just logged and reported back via emailSent so the admin UI can
// show a fallback ("copy the code yourself") only when it's actually
// needed.
export const createInternInvite = createServerFn({ method: "POST" })
  .validator((data: { token: string; invite: { name: string; email: string } }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { randomBytes } = await import("node:crypto");
    const db = await getDb();

    const name = data.invite.name.trim();
    const email = data.invite.email.trim();
    if (!name) throw new Error("Enter the candidate's name.");
    if (!email.includes("@")) throw new Error("Enter a valid email address.");

    const code = randomBytes(4).toString("hex").toUpperCase(); // 8-char code

    const result = await db.collection("interns").insertOne({
      name,
      email,
      secretCode: code,
      status: "invited",
      profilePictureUrl: null,
      createdAt: new Date(),
      claimedAt: null,
    });

    let emailSent = false;
    const appUrl = process.env.APP_URL;
    const signupUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/intern/auth` : "";
    try {
      await sendMail({
        to: email,
        subject: "You're invited to join Edurack as an intern",
        html: internInviteEmailHtml({ candidateName: name, secretCode: code, signupUrl }),
      });
      emailSent = true;
    } catch (err) {
      console.error(`[createInternInvite] invite email failed for internId=${String(result.insertedId)}:`, err);
    }

    return { ok: true, internId: String(result.insertedId), secretCode: code, emailSent };
  });

// ─── Sign up (claims an invite) ─────────────────────────────────────────
export const internSignUp = createServerFn({ method: "POST" })
  .validator((data: InternSignUpInput) => data)
  .handler(async ({ data }) => {
    const username = data.username.trim();
    const secretCode = data.secretCode.trim().toUpperCase();

    if (!username) throw new Error("Choose a username.");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (!secretCode) throw new Error("Enter your invite code.");

    const db = await getDb();

    const existingUsername = await db.collection("interns").findOne({ username });
    if (existingUsername) throw new Error("That username is already taken.");

    // Same non-committal error whether the code is wrong or already
    // claimed — don't help someone brute-force valid codes.
    const invite = await db.collection("interns").findOne({ secretCode, status: "invited" });
    if (!invite) throw new Error("Invalid or already-used invite code.");

    const { hash, salt } = await hashPassword(data.password);

    await db.collection("interns").updateOne(
      { _id: invite._id },
      {
        $set: {
          username,
          passwordHash: hash,
          passwordSalt: salt,
          status: "active",
          claimedAt: new Date(),
        },
      },
    );

    const token = await signInternToken(String(invite._id));
    return {
      ok: true,
      token,
      intern: { id: String(invite._id), username, name: (invite.name as string) ?? username },
    };
  });

// ─── Login ───────────────────────────────────────────────────────────────
export const internLogin = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const intern = await db.collection("interns").findOne({ username: data.username, status: "active" });

    if (
      !intern ||
      !intern.passwordHash ||
      !(await verifyPassword(data.password, intern.passwordHash as string, intern.passwordSalt as string))
    ) {
      throw new Error("Incorrect username or password.");
    }

    const token = await signInternToken(String(intern._id));
    return {
      ok: true,
      token,
      intern: {
        id: String(intern._id),
        name: (intern.name as string) ?? intern.username,
        username: intern.username as string,
        profilePictureUrl: (intern.profilePictureUrl as string | null) ?? null,
      },
    };
  });

// ─── Session check ────────────────────────────────────────────────────────
export const getInternSession = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const internId = await requireIntern(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const intern = await db.collection("interns").findOne({ _id: new ObjectId(internId) });
    if (!intern) throw new Error("Intern account not found.");

    return {
      intern: {
        id: String(intern._id),
        name: (intern.name as string) ?? intern.username,
        username: intern.username as string,
        profilePictureUrl: (intern.profilePictureUrl as string | null) ?? null,
      },
    };
  });

// ─── Admin: list + manage interns ────────────────────────────────────────
export const listInterns = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const db = await getDb();
    const rows = await db.collection("interns").find({}).sort({ createdAt: -1 }).toArray();
    return {
      interns: rows.map((i) => ({
        id: String(i._id),
        username: (i.username as string) ?? "",
        name: i.name as string,
        email: i.email as string,
        secretCode: i.secretCode as string,
        profilePictureUrl: (i.profilePictureUrl as string | null) ?? null,
        status: i.status as "invited" | "active" | "suspended",
        createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : null,
        claimedAt: i.claimedAt instanceof Date ? i.claimedAt.toISOString() : null,
        internshipStartDate: (i.internshipStartDate as string | null) ?? null,
        internshipEndDate: (i.internshipEndDate as string | null) ?? null,
        offerLetterUrl: (i.offerLetterUrl as string | null) ?? null,
        offerLetterUploadedAt: i.offerLetterUploadedAt instanceof Date ? i.offerLetterUploadedAt.toISOString() : null,
        certificateUrl: (i.certificateUrl as string | null) ?? null,
        certificateUnlockDate: (i.certificateUnlockDate as string | null) ?? null,
        certificateUploadedAt: i.certificateUploadedAt instanceof Date ? i.certificateUploadedAt.toISOString() : null,
      })),
    };
  });

export const setInternStatus = createServerFn({ method: "POST" })
  .validator((data: { token: string; internId: string; status: "active" | "suspended" }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const result = await db
      .collection("interns")
      .updateOne({ _id: new ObjectId(data.internId) }, { $set: { status: data.status } });
    if (result.matchedCount === 0) throw new Error("Intern not found.");
    return { ok: true };
  });
// ─── Admin: set/confirm internship dates ──────────────────────────────────
// certificateUnlockDate defaults to internshipEndDate whenever the admin
// doesn't explicitly pass a different one — so setting dates "just works"
// for the common case, and admin only has to think about the unlock date
// separately if they actually want a grace period before/after the
// official end date.
export const setInternshipDates = createServerFn({ method: "POST" })
  .validator((data: { token: string; dates: InternshipDatesInput }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const { internId, internshipStartDate, internshipEndDate, certificateUnlockDate } = data.dates;
    if (!internshipStartDate || !internshipEndDate) throw new Error("Enter both a start and end date.");
    if (new Date(internshipEndDate) < new Date(internshipStartDate)) {
      throw new Error("End date can't be before the start date.");
    }

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(internId) });
    if (!intern) throw new Error("Intern not found.");

    await db.collection("interns").updateOne(
      { _id: new ObjectId(internId) },
      {
        $set: {
          internshipStartDate,
          internshipEndDate,
          certificateUnlockDate: certificateUnlockDate || internshipEndDate,
        },
      },
    );

    let emailSent = false;
    if (intern.email) {
      const appUrl = process.env.APP_URL;
      const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/intern/profile` : "";
      try {
        await sendMail({
          to: intern.email as string,
          subject: "Your Edurack internship dates are confirmed",
          html: internDatesConfirmedEmailHtml({
            internName: intern.name as string,
            startDate: internshipStartDate,
            endDate: internshipEndDate,
            dashboardUrl,
          }),
        });
        emailSent = true;
      } catch (err) {
        console.error(`[setInternshipDates] email failed for internId=${internId}:`, err);
      }
    }

    return { ok: true, emailSent };
  });

// ─── Admin: upload/replace the offer letter ──────────────────────────────
// The file itself is uploaded client-side straight to Supabase (same
// uploadToSupabase() pattern as every other document upload in this app —
// see bundle-modules.tsx) before this is ever called; this just records
// the resulting public URL against the intern and emails them.
export const setOfferLetter = createServerFn({ method: "POST" })
  .validator((data: { token: string; offerLetter: SetOfferLetterInput }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const { internId, offerLetterUrl } = data.offerLetter;
    if (!offerLetterUrl.trim()) throw new Error("Upload a file first.");

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(internId) });
    if (!intern) throw new Error("Intern not found.");

    await db.collection("interns").updateOne(
      { _id: new ObjectId(internId) },
      { $set: { offerLetterUrl: offerLetterUrl.trim(), offerLetterUploadedAt: new Date() } },
    );

    let emailSent = false;
    if (intern.email) {
      try {
        await sendMail({
          to: intern.email as string,
          subject: "Your Edurack offer letter is ready",
          html: internOfferLetterEmailHtml({ internName: intern.name as string, offerLetterUrl: offerLetterUrl.trim() }),
        });
        emailSent = true;
      } catch (err) {
        console.error(`[setOfferLetter] email failed for internId=${internId}:`, err);
      }
    }

    return { ok: true, emailSent };
  });

// ─── Admin: upload/replace the certificate ────────────────────────────────
// Admin can upload this at any point during (or even before the end of)
// the internship — the file is stored immediately, but getMyProfileReport
// in intern-portal.ts only ever returns the URL to the intern once
// certificateUnlockDate has actually passed. The email sent here adapts
// its wording to whichever state applies at the moment of upload.
export const setCertificate = createServerFn({ method: "POST" })
  .validator((data: { token: string; certificate: SetCertificateInput }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const { internId, certificateUrl, certificateUnlockDate } = data.certificate;
    if (!certificateUrl.trim()) throw new Error("Upload a file first.");

    const intern = await db.collection("interns").findOne({ _id: new ObjectId(internId) });
    if (!intern) throw new Error("Intern not found.");

    const resolvedUnlockDate =
      certificateUnlockDate || (intern.certificateUnlockDate as string | null) || (intern.internshipEndDate as string | null);

    await db.collection("interns").updateOne(
      { _id: new ObjectId(internId) },
      {
        $set: {
          certificateUrl: certificateUrl.trim(),
          certificateUnlockDate: resolvedUnlockDate,
          certificateUploadedAt: new Date(),
        },
      },
    );

    const unlocked = Boolean(resolvedUnlockDate) && new Date(resolvedUnlockDate!) <= new Date();

    let emailSent = false;
    if (intern.email) {
      const appUrl = process.env.APP_URL;
      const profileUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/intern/certificate` : "";
      try {
        await sendMail({
          to: intern.email as string,
          subject: unlocked ? "Your Edurack certificate is ready" : "Your Edurack certificate is on its way",
          html: internCertificateEmailHtml({
            internName: intern.name as string,
            unlocked,
            unlockDate: resolvedUnlockDate,
            certificateUrl: unlocked ? certificateUrl.trim() : null,
            profileUrl,
          }),
        });
        emailSent = true;
      } catch (err) {
        console.error(`[setCertificate] email failed for internId=${internId}:`, err);
      }
    }

    return { ok: true, emailSent, unlocked };
  });
