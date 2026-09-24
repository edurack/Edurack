// Public certificate verification — deliberately NO auth token required.
// Anyone scanning a certificate's QR code (or typing the code printed on
// it) should be able to confirm it was really issued by Edurack, the same
// way mentor-profile.$mentorId is public so a shared link works for
// anyone. Only ever returns safe, public fields — never email, username,
// password hash, secretCode, or anything else private about the intern.
//
// Looked up two ways, in order:
//   1. `certificateId` — a short, human-readable code (e.g.
//      "EDR-JUN1026-001") that admin sets per intern specifically so it
//      can be printed on a certificate / encoded in a QR code. This is a
//      new optional field — see the note in intern-types.ts below.
//   2. `username` — falls back to the intern's existing login username,
//      so verification still works for any intern who doesn't have an
//      explicit certificateId set yet.
//
// A record is only ever reported "verified" when status is "active" AND
// a certificate has actually been issued (certificateUrl is set) — an
// "invited" or "suspended" intern, or one whose certificate hasn't been
// uploaded yet, must never show as verified.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/mongo";

export type InternVerificationResult =
  | { found: false }
  | {
      found: true;
      verified: boolean;
      name: string;
      profilePictureUrl: string | null;
      role: string;
      internshipStartDate: string | null;
      internshipEndDate: string | null;
    };

export const verifyInternCertificate = createServerFn({ method: "GET" })
  .validator((data: { certificateId: string }) => data)
  .handler(async ({ data }): Promise<InternVerificationResult> => {
    const raw = data.certificateId.trim();
    if (!raw) return { found: false };

    const db = await getDb();
    const intern = await db.collection("interns").findOne({
      $or: [
        { certificateId: raw },
        { certificateId: raw.toUpperCase() },
        { username: raw.toLowerCase() },
      ],
    });

    if (!intern) return { found: false };

    const verified = intern.status === "active" && Boolean(intern.certificateUrl);

    return {
      found: true,
      verified,
      name: intern.name as string,
      profilePictureUrl: (intern.profilePictureUrl as string | null) ?? null,
      // Optional, admin-set — falls back to the internship program's
      // default title so this reads sensibly even before that field
      // exists on older records.
      role: (intern.role as string | null) ?? "Question Ingestion Intern",
      internshipStartDate: (intern.internshipStartDate as string | null) ?? null,
      internshipEndDate: (intern.internshipEndDate as string | null) ?? null,
    };
  });
