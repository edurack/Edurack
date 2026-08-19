// Public-facing mentor onboarding form submission. Deliberately has no auth
// check — applicants are prospective mentors who don't have an account yet,
// unlike every other server function in this app which requires a signed-in
// user or admin. Writes to `creatorApplications` with status "pending" so
// an admin review screen (e.g. inside MentorHubModule) can list, approve,
// or reject applications later.
import { createServerFn } from "@tanstack/react-start";
import type { ExamKey } from "@/lib/admin-types";
import { getDb } from "@/lib/mongo";

type StudentCategory = string;
type SocialLink = { platform: string; url: string };

type CreatorApplicationInput = {
  fullName: string;
  email: string;
  mobileNumber: string;
  city: string;
  institution: string;
  yearOfStudy: string;
  examRank: string;
  batchTitle: string;
  targetCategory: StudentCategory;
  pricingTier: string;
  socialLinks: SocialLink[];
  examsTaught: ExamKey[];   // ← new: which exam(s) this mentor is applying to mentor for
};

export const submitCreatorApplication = createServerFn({ method: "POST" })
  .validator((data: CreatorApplicationInput) => data)
  .handler(async ({ data }) => {
    if (!data.fullName?.trim()) throw new Error("Full name is required.");
    if (!/^\S+@\S+\.\S+$/.test(data.email ?? "")) throw new Error("A valid email is required.");
    if (!/^\d{10}$/.test(data.mobileNumber ?? "")) throw new Error("A valid 10-digit mobile number is required.");

    const validExams: ExamKey[] = ["neet", "jee", "cuet", "ipmat"];
    const examsTaught = (data.examsTaught ?? []).filter((e) => validExams.includes(e));
    if (examsTaught.length === 0) throw new Error("Select at least one exam you'd like to mentor for.");

    const db = await getDb();

    const socialLinks = (data.socialLinks ?? [])
      .filter((l) => l.url?.trim())
      .map((l) => ({ platform: l.platform, url: l.url.trim() }))
      .slice(0, 5);

    const result = await db.collection("creatorApplications").insertOne({
      personal: {
        fullName: data.fullName.trim(),
        email: data.email.trim(),
        mobileNumber: data.mobileNumber.trim(),
        city: data.city.trim(),
      },
      credentials: {
        institution: data.institution.trim(),
        yearOfStudy: data.yearOfStudy.trim(),
        examRank: data.examRank.trim(),
      },
      mentorship: {
        batchTitle: data.batchTitle.trim(),
        targetCategory: data.targetCategory,
        pricingTier: data.pricingTier.trim(),
        examsTaught,  // ← stored here
      },
      socialLinks,
      status: "pending",
      submittedAt: new Date(),
    });

    return { ok: true, applicationId: String(result.insertedId) };
  });