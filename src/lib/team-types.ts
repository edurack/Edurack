// Shared (client + server) types for the admin Team module. Pure — no server imports.
export type TeamMember = {
  uid: string;
  email: string;
  name: string;
  /** Free text the person sets themselves, e.g. "COO", "Co-founder · Tech". */
  title: string;
  bio: string;
  /** Avatar background (hex). */
  color: string;
  joinedAt: string | null;
  lastActiveAt: string | null;
  /** Number of logged changes in the last 7 days (filled by listTeam). */
  actions7d: number;
  /** True when the email is outside the team domain (older admin accounts). */
  outsideDomain: boolean;
};

export type TeamFeedItem = {
  id: string;
  kind: "action" | "update";
  uid: string;
  name: string;
  color: string;
  at: string;
  /** For actions. */
  module?: string;
  label?: string;
  summary?: string;
  /** For updates (daily progress posts). */
  done?: string;
  next?: string;
  blockers?: string;
};

export const AVATAR_COLORS = ["#DCEAFB", "#F7ECC4", "#CDF0DD", "#F8D9C6", "#E5DDF7", "#C9EEE8", "#FBD5E0", "#E4E9F1"];
export const TEAM_DOMAIN_DEFAULT = "edurack.in";
