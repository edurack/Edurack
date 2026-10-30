import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { IconFileText as FileText } from "@tabler/icons-react";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const Route = createFileRoute("/legal/privacy")({
  head: () => pageHead({"title": "Privacy Policy", "path": "/legal/privacy", "description": "How Edurack collects, uses and protects your personal information, including your mobile number, when you use our platform."}),
  component: PrivacyPage,
});

// Keep this page in step with PRIVACY_POLICY_VERSION in src/server-functions/profile.ts: bump both when the text changes in a way that affects consent.
function PrivacyPage() {
  return (
    <LegalLayout
      icon={FileText}
      eyebrow="Legal"
      title="Privacy Policy"
      lastUpdated="October 29, 2026"
    >
      <LegalSection title="1. Who we are">
        <p>
          Edurack (edurack.in) runs a mock-test and mentorship marketplace for exam aspirants. This policy explains what personal information
          we collect, why we collect it, who we share it with, and the choices you have. You can reach us about any of it at contact@edurack.in.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong>Account details:</strong> your name, email address, mobile number, city, class, board, target exam and, if you add it, the year you plan to
          sit the exam. You sign in with Google or with an email and password.
        </p>
        <p>
          <strong>Practice and learning data:</strong> the tests, drills and questions you attempt, your answers and scores, your notebook, your streaks and
          the analysis built from them.
        </p>
        <p>
          <strong>Purchases:</strong> what you buy, the amount and a payment reference. Payments are processed by Razorpay; we receive confirmation and
          payment identifiers, not your full card or UPI credentials.
        </p>
        <p>
          <strong>Device and usage data:</strong> a device identifier used to manage your sessions, and product analytics about how the site is used. On some
          pages we also use screen-session recordings to find and fix problems. We switch recordings off on sign-in, profile, purchase and similar screens.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use it">
        <p>
          To create and run your account, deliver tests, practice and mentor sessions, show you your analysis, process payments and refunds, answer your
          support requests, keep the platform secure, prevent misuse, improve the product, and meet our legal obligations.
        </p>
      </LegalSection>

      <LegalSection title="4. Your mobile number">
        <p>
          We ask for your mobile number when you sign up so that we can reach you. When you give it, we tell you we may contact you on it about your account,
          your sessions, your purchases and your prep, by call, SMS or WhatsApp. That is the only use you agree to by continuing.
        </p>
        <p>
          Offers, test reminders and updates on WhatsApp and SMS are separate and optional: they are sent only if you tick the box that offers them, and you
          can turn them off at any time on your Profile page. We keep a record of when you gave or changed your choice and which version of this policy you saw.
          We do not sell your mobile number.
        </p>
      </LegalSection>

      <LegalSection title="5. Who we share information with">
        <p>
          We use service providers to run Edurack: Google Firebase for sign-in, MongoDB for our database, Razorpay for payments, PostHog for product analytics
          and Resend for sending email. They process information on our behalf and only for those purposes. If you buy a batch or book a session, the mentor
          receives the details needed to deliver it. We may also disclose information where the law requires it, or to protect the safety of our users.
          We do not sell your personal information.
        </p>
      </LegalSection>

      <LegalSection title="6. Students under 18">
        <p>
          Many Edurack users are school students, including some under 18. We ask students under 18 to use Edurack with a parent or guardian's knowledge.
          We are updating how we handle children's data to meet India's Digital Personal Data Protection Act, 2023 and the Rules made under it as they come into force.
        </p>
      </LegalSection>

      <LegalSection title="7. How long we keep information">
        <p>
          We keep your account and practice data while your account is active. We keep payment and tax records for as long as the law requires. You can ask us to
          delete your account and the personal information we hold about you by writing to contact@edurack.in, and we will do so unless we must keep something by law.
        </p>
      </LegalSection>

      <LegalSection title="8. Your choices and rights">
        <p>
          You can see and correct your name, mobile number and city on your Profile page. You can ask us for a copy of your information, ask us to correct or erase it,
          withdraw a consent you gave, or make a complaint, by writing to contact@edurack.in. We will respond as quickly as we can.
        </p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>
          We use reasonable technical and organisational measures to protect your information, including encrypted connections and token-based sign-in. No system is completely
          secure, so please keep your password private and tell us straight away if you think your account has been misused.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <p>
          We may update this policy as Edurack grows or the law changes. The "Last updated" date above shows when it last changed. If a change affects how we use your
          mobile number, we will ask for your choice again.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
