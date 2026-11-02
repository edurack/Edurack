import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { RotateCcw } from "lucide-react"; // TODO: no Tabler mapping found yet
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const Route = createFileRoute("/legal/refund")({
  head: () => pageHead({"title": "Refund & Cancellation Policy", "path": "/legal/refund", "description": "When purchases of Edurack Pro plans, test series, mentorship batches and sessions can be cancelled or refunded, and how to request one."}),
  component: RefundPage,
});

function RefundPage() {
  return (
    <LegalLayout
      icon={RotateCcw}
      eyebrow="Legal"
      title="Refund Policy"
      lastUpdated="November 2, 2026"
    >
      <LegalSection title="1. Custom-Priced Mentorship Programs">
        <p>
          Mentorship batches on EDURACK are listed and priced independently by each
          mentor. Because each program's pricing, schedule, and inclusions are set
          by the mentor rather than EDURACK, refund eligibility for a mentorship
          batch is governed by the specific refund terms published on that batch's
          product page at the time of purchase.
        </p>
        <p>
          Where a mentor has not published batch-specific terms, the following
          default window applies: a refund request made within 48 hours of purchase
          and before any live session or content has been accessed is eligible for a
          full refund, minus any payment gateway charges already incurred.
        </p>
      </LegalSection>

      <LegalSection title="2. After Access Has Started">
        <p>
          Once a student has accessed mentor-provided content — recorded sessions,
          downloadable planners, syllabus PDFs, or attended a live mentorship
          session — the batch is generally considered delivered, and refund
          requests will be evaluated case-by-case with the mentor's input.
        </p>
      </LegalSection>

      <LegalSection title="3. Credential Misrepresentation">
        <p>
          Every mentor on EDURACK warrants that the exam ranks, institutional
          affiliations, and other credentials advertised on their profile are
          authentic and verifiable. If EDURACK determines that a mentor
          misrepresented their credentials, all students enrolled in the affected
          batch are entitled to a full refund, regardless of how much content has
          already been accessed.
        </p>
      </LegalSection>

      <LegalSection title="4. CBT Mock Test Engine Accessibility">
        <p>
          The CBT mock test simulator is offered as part of a student's platform
          access and is not sold as a separate line item. If a technical issue on
          EDURACK's end prevents you from starting or completing a purchased mock
          test attempt, contact our team and we will restore your attempt or extend
          your access window at no additional cost.
        </p>
        <p>
          Refunds are not provided for mock test attempts that were completed
          normally, or for dissatisfaction with a score or result, since the
          simulator functioned as intended in these cases.
        </p>
      </LegalSection>

      <LegalSection title="5. Non-Refundable Situations">
        <p>
          Requests made after a mentorship batch has concluded, after the majority
          of a bundle's content has been downloaded or viewed, or based on a change
          of mind unrelated to a platform, delivery, or credential issue, are
          generally not eligible for a refund.
        </p>
      </LegalSection>

      <LegalSection title="6. Edurack Pro Plans">
        <p>
          Edurack Pro is a paid plan that unlocks extra practice features for a
          fixed number of days, shown on the plan when you buy it. Pro plans do not
          renew automatically, so you are never charged again unless you choose to
          buy another plan.
        </p>
        <p>
          A refund request made within 48 hours of purchase is eligible for a full
          refund, minus any payment gateway charges already incurred. When a refund
          is approved, Pro access for that purchase ends.
        </p>
        <p>
          After 48 hours, Pro plans are generally not refundable. The exceptions are
          being charged twice for the same plan, and a technical issue on EDURACK's
          end that stops you from using the Pro features you paid for and that we
          cannot fix. In those cases we will fix the problem, extend your plan, or
          refund you.
        </p>
        <p>
          If you were charged but Pro did not switch on, contact us with your
          payment details and we will either activate it or refund the payment. If a
          parent or guardian paid for your plan, the refund goes back to the payment
          method they used.
        </p>
      </LegalSection>

      <LegalSection title="7. How to Request a Refund">
        <p>
          Reach out to our team with your order details and the reason for your
          request. Approved refunds are credited back to your original payment
          method and may take a few business days to reflect, depending on your
          bank or payment provider.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}