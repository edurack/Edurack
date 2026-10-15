// Pure helpers that turn a Resend bounce (type + subtype) into plain English for the admin: what happened,
// and what to do. Categories are Resend's own: Permanent (General, NoEmail, OnAccountSuppressionList),
// Transient (General, MailboxFull) and Undetermined.
export type BounceHelp = { headline: string; cause: string; fix: string; permanent: boolean };

export function explainBounce(type?: string | null, subType?: string | null): BounceHelp {
  const t = (type ?? "").toLowerCase();
  const s = (subType ?? "").toLowerCase();
  if (t === "permanent") {
    if (s === "onaccountsuppressionlist" || s === "suppressed") {
      return { headline: "Already blocked by Resend", cause: "This address hard-bounced before, so Resend refused to send to it again.", fix: "Nothing to do; we block it too. If the student really owns this address, ask them to check the spelling.", permanent: true };
    }
    if (s === "noemail") {
      return { headline: "Address doesn't exist", cause: "The mail server said there is no such mailbox, or the address couldn't be read. Usually a typo at sign-up.", fix: "Ask the student to correct the email on their profile. Don't retry; we've stopped emailing it.", permanent: true };
    }
    return { headline: "Rejected for good", cause: "The recipient's mail provider refused the email permanently: a closed account, a wrong address, or a domain that doesn't accept mail.", fix: "Stop emailing this address (done automatically). Reach the student another way and get a working address.", permanent: true };
  }
  if (t === "transient") {
    if (s === "mailboxfull") {
      return { headline: "Inbox full", cause: "The student's mailbox is full, so their provider turned the email away.", fix: "Temporary, but it keeps failing until they clear space. After 3 bounces in 30 days we stop emailing automatically.", permanent: false };
    }
    return { headline: "Temporary problem", cause: "The recipient's mail provider had a short-term problem or deferred the message.", fix: "Usually nothing: it often works next time. We stop automatically after 3 such bounces in 30 days.", permanent: false };
  }
  if (t === "undetermined") {
    return { headline: "Reason unclear", cause: "The provider bounced it but didn't say why.", fix: "Treat it as temporary. Open the email in Resend → Emails for any extra detail. Repeated bounces get the address blocked automatically.", permanent: false };
  }
  return { headline: "Details not recorded", cause: "This bounce was logged before we saved details, or Resend sent none.", fix: "Open Resend → Emails, filter by Bounced, and click See Details for the exact reason.", permanent: false };
}

/** Typos in the domain part that cause most "address doesn't exist" bounces. Only unambiguous ones. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com", "gnail.com": "gmail.com", "gmal.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.comm": "gmail.com", "gmeil.com": "gmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "outloook.com": "outlook.com",
  "rediffmial.com": "rediffmail.com", "icloud.con": "icloud.com",
};

/** If the domain looks like a typo of a common provider, return the corrected address; otherwise null. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fixed = DOMAIN_TYPOS[email.slice(at + 1).trim().toLowerCase()];
  return fixed ? email.slice(0, at + 1) + fixed : null;
}
