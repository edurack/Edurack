import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";

// Shared with the main site header/footer — keep in sync if the asset moves.
const LOGO_SRC = "/assets/branding/edurack-logo.png";

interface LegalLayoutProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the /legal/* route suite (terms, privacy, refund).
 * Keeps typography, spacing, and the claymorphic card treatment
 * identical across every compliance document.
 */
export function LegalLayout({ icon: Icon, eyebrow, title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="https://i.postimg.cc/4NvD69v0/image-removebg-preview.png"
              alt="EDURACK"
              className="h-10 w-auto shrink-0 object-contain sm:h-12"
            />
            <span className="font-display text-xl font-bold tracking-tight text-slate-900">
              EDURACK
            </span>
          </Link>
          <Link
            to="/"
            className="clay-btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold sm:text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>

        <div className="mt-10 text-center">
          <div className="clay-chip mx-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sky-700 sm:text-sm">
            <Icon className="h-4 w-4" />
            {eyebrow}
          </div>
          <h1 className="fluid-h2 mt-4 font-display font-extrabold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-2 text-xs font-medium text-slate-500">Last updated: {lastUpdated}</p>
        </div>

        <div className="clay mt-8 p-6 sm:p-10">
          <div className="prose-legal space-y-8 text-sm leading-relaxed text-slate-700">
            {children}
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-slate-500">
          Questions about these terms?{" "}
          <Link to="/contact" className="font-semibold text-slate-700 hover:underline">
            Contact our team
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
      <div className="mt-2.5 space-y-2.5 text-slate-600">{children}</div>
    </section>
  );
}