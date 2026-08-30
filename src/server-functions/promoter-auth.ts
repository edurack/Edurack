// Promoter authentication — mirrors the mentor-auth.ts pattern (stateless,
// HMAC-signed session tokens, no Firebase Auth) but is intentionally a
// fully separate identity system:
//   - separate Mongo collection ("promoters", not "mentors")
//   - separate session secret (PROMOTER_SESSION_SECRET, not
//     MENTOR_SESSION_SECRET) so a leaked/rotated secret on one side never
//     affects the other
//   - separate sign-up flow, since promoters are outsiders who self-serve
//     their own login rather than being onboarded by an admin form
//
// DESIGN NOTE — the "secret code":
// The Promoters spec lists sign-up fields as Username / Password / Secret
// code. Since no email is collected at sign-up, an open "anyone can
// register" flow would have no gate at all. So here the secret code is
// an admin-issued INVITE code: an admin creates an "invited" promoter
// record (see createPromoterInvite) with a code, and promoterSignUp below
// requires that exact code to match an unclaimed invite before letting
// someone set their own username + password. If you intended a fully
// open sign-up instead (anyone can pick their own secret code), that's a
// small change to promoterSignUp — say the word.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import type { PromoterProfileUpdateInput } from "@/lib/promoter-types";

// ─── Password hashing (same scheme as mentor-auth.ts: scrypt + per-user salt) ─
function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ─── Session tokens ──────────────────────────────────────────────────────────
function getSessionSecret(): string {
  const secret = process.env.PROMOTER_SESSION_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: PROMOTER_SESSION_SECRET is not set");
  }
  return secret;
}

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days, same as mentors

function signPromoterToken(promoterId: string): string {
  const secret = getSessionSecret();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${promoterId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifyPromoterToken(token: string): { promoterId: string } | null {
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [promoterId, expiresAtStr, signature] = parts;

  const expectedSignature = createHmac("sha256", secret)
    .update(`${promoterId}.${expiresAtStr}`)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  if (Date.now() > Number(expiresAtStr)) return null;

  return { promoterId };
}

// Shared by every promoter-session-authenticated function IN THIS FILE.
// Deliberately NOT exported — mirrors mentor-auth.ts's requireMentor,
// which is also file-private. Exporting this and importing it
// cross-file (as promoter-portal.ts originally did) breaks TanStack
// Start's client-bundle stripping: a plain function used outside its
// own file's createServerFn handlers can't be proven client-unused, so
// the bundler keeps it — and drags node:crypto into the browser bundle
// with it, where it doesn't exist ("Module node:crypto has been
// externalized for browser compatibility"). Every other file that needs
// this check (promoter-portal.ts, etc.) duplicates its own copy instead,
// same as admin.ts duplicates requireSuperAdmin rather than importing it
// from mentor-auth.ts.
async function requirePromoter(token: string): Promise<string> {
  const verified = verifyPromoterToken(token);
  if (!verified) throw new Error("Session expired. Please sign in again.");
  return verified.promoterId;
}

// ─── Sign up (claims an admin-issued invite code) ───────────────────────────

export const promoterSignUp = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string; secretCode: string }) => data)
  .handler(async ({ data }) => {
    const username = data.username.trim();
    const secretCode = data.secretCode.trim();

    if (!username) throw new Error("Enter a username.");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (!secretCode) throw new Error("Enter your secret code.");

    const db = await getDb();

    const existingUsername = await db.collection("promoters").findOne({ username });
    if (existingUsername) throw new Error("That username is already taken.");

    // Must match an invite that hasn't been claimed yet. Same error
    // whether the code is wrong or already used — don't help someone
    // brute-force valid codes.
    const invite = await db.collection("promoters").findOne({ secretCode, status: "invited" });
    if (!invite) throw new Error("Invalid or already-used secret code.");

    const { hash, salt } = hashPassword(data.password);

    await db.collection("promoters").updateOne(
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

    const token = signPromoterToken(String(invite._id));
    return {
      ok: true,
      token,
      promoter: { id: String(invite._id), username, name: (invite.name as string) ?? username },
    };
  });

// ─── Login ───────────────────────────────────────────────────────────────────

export const promoterLogin = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const promoter = await db.collection("promoters").findOne({ username: data.username, status: "active" });

    if (
      !promoter ||
      !promoter.passwordHash ||
      !verifyPassword(data.password, promoter.passwordHash as string, promoter.passwordSalt as string)
    ) {
      throw new Error("Incorrect username or password.");
    }

    const token = signPromoterToken(String(promoter._id));
    return {
      ok: true,
      token,
      promoter: {
        id: String(promoter._id),
        name: (promoter.name as string) ?? promoter.username,
        username: promoter.username as string,
        profilePictureUrl: (promoter.profilePictureUrl as string | null) ?? null,
      },
    };
  });

// Confirms a stored session token is still valid + returns a lightweight
// identity, same role getMentorSession plays for mentors.
export const getPromoterSession = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const promoter = await db.collection("promoters").findOne({ _id: new ObjectId(promoterId) });
    if (!promoter) throw new Error("Promoter account not found.");

    return {
      promoter: {
        id: String(promoter._id),
        name: (promoter.name as string) ?? promoter.username,
        username: promoter.username as string,
        profilePictureUrl: (promoter.profilePictureUrl as string | null) ?? null,
      },
    };
  });

// ─── Forgot password ─────────────────────────────────────────────────────────
// No email is collected at sign-up, so there's nothing to send a reset
// link to. Instead this files a request an admin can see and act on from
// the Promoters admin section — mirroring how mentor login credentials
// are already handed over manually (see OnboardingDetailsDrawer's
// generatedCredentials flow) rather than through an automated email loop.
export const requestPromoterPasswordReset = createServerFn({ method: "POST" })
  .validator((data: { username: string; contactNote: string }) => data)
  .handler(async ({ data }) => {
    const username = data.username.trim();
    if (!username) throw new Error("Enter your username.");

    const db = await getDb();
    const promoter = await db.collection("promoters").findOne({ username, status: "active" });
    // Same response whether the username exists or not — don't confirm
    // valid usernames to an anonymous caller.
    if (promoter) {
      await db.collection("promoterPasswordResetRequests").insertOne({
        promoterId: promoter._id,
        username,
        contactNote: data.contactNote.trim(),
        status: "pending",
        createdAt: new Date(),
      });
    }

    return { ok: true };
  });

// ─── Profile (self-service, non-locked fields only) ─────────────────────────

export const getMyPromoterProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();
    const p = await db.collection("promoters").findOne({ _id: new ObjectId(promoterId) });
    if (!p) throw new Error("Promoter account not found.");

    return {
      profile: {
        id: String(p._id),
        username: p.username as string,
        name: (p.name as string) ?? "",
        secretCode: (p.secretCode as string) ?? "",
        profilePictureUrl: (p.profilePictureUrl as string | null) ?? null,
        email: (p.email as string) ?? "",
        socialLinks: (p.socialLinks as { platform: string; url: string }[]) ?? [],
        upiIds: (p.upiIds as string[]) ?? [],
        status: (p.status as "active" | "suspended") ?? "active",
        createdAt: p.claimedAt instanceof Date ? p.claimedAt.toISOString() : null,
      },
    };
  });

export const updateMyPromoterProfile = createServerFn({ method: "POST" })
  .validator((data: { token: string; profile: PromoterProfileUpdateInput }) => data)
  .handler(async ({ data }) => {
    const promoterId = await requirePromoter(data.token);
    const { ObjectId } = await import("mongodb");
    const db = await getDb();

    const { name, profilePictureUrl, email, socialLinks, upiIds } = data.profile;
    if (!name.trim()) throw new Error("Name cannot be empty.");
    if (!email.trim() || !email.includes("@")) throw new Error("Enter a valid email address.");

    await db.collection("promoters").updateOne(
      { _id: new ObjectId(promoterId) },
      {
        $set: {
          name: name.trim(),
          profilePictureUrl,
          email: email.trim(),
          socialLinks: socialLinks.map((l) => ({ platform: l.platform, url: l.url.trim() })).filter((l) => l.url),
          upiIds: upiIds.map((u) => u.trim()).filter(Boolean),
        },
      },
    );

    return { ok: true };
  });