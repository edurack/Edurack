// Search/social metadata for a public mentor-session page, in one place so the
// route's head() and anything else describing a session stay consistent.
import { SITE_URL, breadcrumbJsonLd, truncate } from "@/lib/seo";
import { formatForOffering, type MentorBioForOffering, type OpenSlot, type PublicMentorOffering } from "@/lib/session-types";

export const SESSIONS_HUB_PATH = "/mentorship-sessions";

const absoluteUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

function kindLabel(o: { capacity: number; isFree: boolean }): string {
  const f = formatForOffering(o);
  if (f === "one_on_one") return "1:1 session";
  if (f === "open_unlimited") return "open session";
  return "group session";
}

/** "AIR 342, AIIMS Delhi" — whatever credentials the mentor has filled in. */
function credentialLine(bio: Pick<MentorBioForOffering, "aiimsIitRank" | "enrolledCollege">): string {
  return [bio.aiimsIitRank, bio.enrolledCollege].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

export function buildSessionSeo(input: { offering: PublicMentorOffering; mentorBio: MentorBioForOffering; slots: OpenSlot[] }, path: string) {
  const { offering, mentorBio, slots } = input;
  const url = `${SITE_URL}${path}`;
  const cred = credentialLine(mentorBio);
  const mentorWithCred = cred ? `${mentorBio.name} (${cred})` : mentorBio.name;
  const subject = (offering.subject ?? "").trim();
  const priceText = offering.isFree ? "Free to join." : `₹${offering.price}.`;

  // A mentor-written description is the best snippet — but only if it says
  // enough. A one-liner gets the standard facts appended so the result isn't thin.
  const written = (offering.description ?? "").replace(/\s+/g, " ").trim();
  const generated = `${offering.durationMinutes}-minute ${kindLabel(offering)}${subject ? ` on ${subject}` : ""} with ${mentorWithCred}. ${priceText} Pick a time and book on Edurack.`;
  const description = written.length >= 90 ? written : written ? `${written} ${generated}` : generated;

  const image = offering.posterUrl ?? offering.thumbnailUrl ?? mentorBio.photoUrl ?? null;
  const profileUrl = `${SITE_URL}/mentor-profile/${offering.mentorId}`;

  const service: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name: offering.title,
    description: truncate(description, 300),
    serviceType: `${subject ? `${subject} ` : ""}mentorship session`,
    url,
    image: absoluteUrl(image),
    areaServed: { "@type": "Country", name: "India" },
    audience: { "@type": "EducationalAudience", educationalRole: "student", audienceType: "Students preparing for competitive exams" },
    provider: {
      "@type": "Person",
      name: mentorBio.name,
      url: profileUrl,
      image: absoluteUrl(mentorBio.photoUrl),
      ...(mentorBio.enrolledCollege ? { alumniOf: { "@type": "CollegeOrUniversity", name: mentorBio.enrolledCollege } } : {}),
    },
    offers: {
      "@type": "Offer",
      url,
      price: offering.isFree ? 0 : Number(offering.price) || 0,
      priceCurrency: "INR",
      availability: slots.length > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Edurack", url: SITE_URL },
    },
  };

  return {
    title: `${offering.title} with ${mentorBio.name}`,
    description,
    image,
    jsonLd: [
      service,
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Mentorship sessions", path: SESSIONS_HUB_PATH },
        { name: offering.title, path },
      ]),
    ],
  };
}
