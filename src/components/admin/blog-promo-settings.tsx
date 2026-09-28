// src/components/admin/blog-promo-settings.tsx
//
// Admin panel (inside the Blog tab) for the "free test series" popup that
// blog pages show 10 seconds after loading. One card per audience: JEE blogs,
// NEET blogs, and a general one for everything else. Paste the test-series
// link for each and switch it on.
import { useEffect, useState } from "react";
import { IconLoader2 as Loader2, IconCircleCheck as CheckCircle2, IconAlertCircle as AlertCircle } from "@tabler/icons-react";
import { getBlogPromoSettingsAdmin, saveBlogPromoSettings } from "@/server-functions/blog-admin";
import {
  BLOG_PROMO_AUDIENCES,
  BLOG_PROMO_AUDIENCE_LABELS,
  BLOG_PROMO_DELAY_MS,
  DEFAULT_BLOG_PROMO_SETTINGS,
} from "@/lib/blog-types";
import type { BlogPromoAudience, BlogPromoConfig, BlogPromoSettings } from "@/lib/blog-types";

export function BlogPromoSettingsPanel({ adminUser }: { adminUser: { getIdToken: () => Promise<string> } }) {
  const [settings, setSettings] = useState<BlogPromoSettings>(DEFAULT_BLOG_PROMO_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await adminUser.getIdToken();
        const r = await getBlogPromoSettingsAdmin({ data: { token } });
        if (!cancelled) setSettings(r.settings);
      } catch {
        if (!cancelled) setError("Couldn't load popup settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(audience: BlogPromoAudience, change: Partial<BlogPromoConfig>) {
    setSaved(false);
    setSettings((prev) => ({ ...prev, [audience]: { ...prev[audience], ...change } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await adminUser.getIdToken();
      await saveBlogPromoSettings({ data: { token, settings } });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="clay mb-6 flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="clay mb-6 p-5">
      <div className="mb-4">
        <p className="text-sm font-bold text-foreground">Free test series popup</p>
        <p className="mt-1 text-xs text-foreground/60">
          Shown {BLOG_PROMO_DELAY_MS / 1000} seconds after a blog page loads, once per visitor session. JEE posts (JEE exam or
          JEE Strategy category) use the JEE link, NEET posts the NEET link, everything else — and the blog home — the general
          one. If a JEE/NEET popup is off, that audience falls back to the general popup.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {BLOG_PROMO_AUDIENCES.map((audience) => {
          const c = settings[audience];
          return (
            <div key={audience} className="clay-inset space-y-2.5 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-foreground/60">{BLOG_PROMO_AUDIENCE_LABELS[audience]}</p>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => patch(audience, { enabled: e.target.checked })} />
                  On
                </label>
              </div>
              <input
                value={c.url}
                onChange={(e) => patch(audience, { url: e.target.value })}
                placeholder="Test series link — /course/bundle/abc or https://…"
                className="w-full rounded-xl bg-background px-3 py-2 font-mono text-xs focus:outline-none"
              />
              <input
                value={c.title}
                onChange={(e) => patch(audience, { title: e.target.value })}
                placeholder="Popup heading"
                maxLength={120}
                className="w-full rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
              />
              <textarea
                value={c.message}
                onChange={(e) => patch(audience, { message: e.target.value })}
                placeholder="Popup message"
                rows={3}
                maxLength={300}
                className="w-full resize-none rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
              />
              <input
                value={c.buttonLabel}
                onChange={(e) => patch(audience, { buttonLabel: e.target.value })}
                placeholder="Button text"
                maxLength={40}
                className="w-full rounded-xl bg-background px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="clay-btn flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save popup settings
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1 text-xs font-semibold text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
