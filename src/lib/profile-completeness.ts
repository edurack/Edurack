// Pure helpers (client + server safe) for "has this student finished their profile?".
//
// Onboarding (routes/auth.tsx) only asks for exam + track, then saves PLACEHOLDERS for
// everything else: the Google display name or "Student", mobile "0000000000" and city
// "Not Specified". So "complete" here means the name, mobile and city are REAL values,
// not just non-empty. Board is deliberately not checked: onboarding defaults it to CBSE,
// which is a legitimate real value we can't tell apart from a default.

export const PLACEHOLDER_MOBILE = "0000000000";
export const PLACEHOLDER_CITY = "Not Specified";
const PLACEHOLDER_NAME = "student";

export type MissingProfileField = "fullName" | "mobile" | "city";

type BasicProfile = { fullName?: string | null; mobile?: string | null; city?: string | null };

export const isRealName = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length >= 2 && t.toLowerCase() !== PLACEHOLDER_NAME;
};
// Same 10-digit rule the Profile page enforces, minus the onboarding placeholder.
export const isRealMobile = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return /^\d{10}$/.test(t) && t !== PLACEHOLDER_MOBILE;
};
export const isRealCity = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length >= 2 && t.toLowerCase() !== PLACEHOLDER_CITY.toLowerCase();
};

export function missingProfileFields(p: BasicProfile | null | undefined): MissingProfileField[] {
  const out: MissingProfileField[] = [];
  if (!isRealName(p?.fullName)) out.push("fullName");
  if (!isRealMobile(p?.mobile)) out.push("mobile");
  if (!isRealCity(p?.city)) out.push("city");
  return out;
}
