import { createFileRoute } from "@tanstack/react-router";
import { IconFileText as FileText } from "@tabler/icons-react";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalLayout
      icon={FileText}
      eyebrow="Legal"
      title="Terms of Service"
      lastUpdated="September 10, 2026"
    >
      <LegalSection title="1. The EDURACK Marketplace">
        <p>
          EDURACK operates an open marketplace connecting students with independent
          mentors — AIIMS and top-tier college rankers who create and run their own
          mentorship batches. EDURACK is the platform that hosts, discovers, and
          processes payment for these batches; it is not the instructor of record for
          any individual batch.
        </p>
      </LegalSection>

      <LegalSection title="2. Mentor Verification & Credentials">
        <p>
          Every mentor on EDURACK is required to warrant that the academic
          credentials, exam ranks, and institutional affiliations advertised on
          their profile are authentic and verifiable. Falsified credentials are a
          serious violation of our mentor agreements and result in the mentor's
          immediate removal from the platform. If you believe a mentor's advertised
          credentials are inaccurate, please report it to our team.
        </p>
      </LegalSection>

      <LegalSection title="3. Mentors Set Their Own Rates">
        <p>
          Every mentor independently sets the pricing tier, batch structure, and
          content roadmap for their mentorship space. EDURACK does not fix, cap, or
          negotiate mentor pricing on a mentor's behalf. Students should review a
          batch's listed price, inclusions, and mentor credentials before purchasing.
        </p>
      </LegalSection>

      <LegalSection title="4. Content Ownership">
        <p>
          Mentors retain full ownership of the syllabus material, planners, videos,
          and other resources they upload to their mentorship space. EDURACK is
          granted a limited license to host and deliver this content to enrolled
          students for the duration of their access period, and does not claim
          ownership over mentor-created intellectual property.
        </p>
      </LegalSection>

      <LegalSection title="5. Platform Fee">
        <p>
          EDURACK charges a transaction-based platform fee on each successful
          purchase, currently 15% of net revenue on direct mentor-space and cohort
          batches, and 25% of net revenue on co-branded premium test series. This
          fee funds payment processing, hosting, discovery, and support
          infrastructure. It is deducted from the mentor's payout and does not
          change the price a student sees or pays at checkout.
        </p>
      </LegalSection>

      <LegalSection title="6. Independent Contractor Relationship">
        <p>
          Mentors operate on EDURACK as independent contractors, not as EDURACK
          employees or agents. A mentorship batch is purchased on the strength of
          the individual mentor's brand, credentials, and offering — not as direct
          instruction from EDURACK. Primary responsibility for batch delivery,
          content quality, and communication with enrolled students rests with the
          mentor.
        </p>
      </LegalSection>

      <LegalSection title="7. Student Access & Conduct">
        <p>
          Access to a mentorship batch or CBT mock test series is granted per the
          terms listed on that specific product page. Sharing login credentials,
          reselling access, or redistributing mentor content outside the platform is
          not permitted and may result in access being revoked without refund.
        </p>
        <p>
          Mentors are contractually prohibited from soliciting students to transact
          off-platform or move to unapproved private groups. If a mentor asks you to
          pay or communicate outside EDURACK, please report it to our team.
        </p>
      </LegalSection>

      <LegalSection title="8. Child Safety Commitment">
        <p>
          EDURACK requires every mentor to maintain professional conduct at all
          times and strictly prohibits unsolicited personal contact with minor
          students. In compliance with the POCSO Act, 2012, any suspected or actual
          offense against a minor is escalated immediately, the mentor's access is
          suspended pending investigation, and the matter is reported to law
          enforcement as required by law.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of Liability">
        <p>
          EDURACK is not liable for indirect, incidental, or consequential damages
          arising from server downtime, third-party payment gateway failures, or
          internet connectivity issues outside its control. EDURACK's role is
          limited to providing the technology platform; mentors are independently
          responsible for the content and delivery of their mentorship batches.
        </p>
      </LegalSection>

      <LegalSection title="10. Dispute Resolution & Governing Law">
        <p>
          These Terms are governed by the laws of India. Any dispute will first be
          addressed through good-faith discussion between the parties. If unresolved
          within fifteen days, the dispute shall be referred to binding arbitration
          under the Arbitration and Conciliation Act, 1996, seated in New Delhi,
          India, with courts in New Delhi having exclusive jurisdiction over any
          related matters.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to These Terms">
        <p>
          EDURACK may update these terms as the platform evolves. Material changes
          will be reflected by an updated "Last updated" date on this page.
          Continued use of EDURACK after changes take effect constitutes acceptance
          of the revised terms.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}