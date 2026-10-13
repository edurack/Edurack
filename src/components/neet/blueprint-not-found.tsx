import { Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

export function BlueprintNotFound() {
  return (
    <>
      <SiteHeader backLabel="Back to home" />
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-foreground/60">That subject or chapter isn't in the NEET weightage guide.</p>
        <Link to="/neet/chapter-wise-weightage" className="clay-btn mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white">
          See all NEET chapters
        </Link>
      </div>
      <SiteFooter />
    </>
  );
}
