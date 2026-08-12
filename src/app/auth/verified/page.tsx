import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { TavliLogo } from "@/components/tavli-logo";

export const dynamic = "force-dynamic";

/**
 * Diner-facing confirmation screen. `/auth/callback` routes here after a
 * successful code exchange for anyone who is not a partner or admin; those
 * two go to `/partner/verified` instead, which speaks to setting up a venue.
 *
 * Lives under `/auth` rather than `/[lang]/[city]` because the callback has no
 * city context to redirect into, and `/auth` is excluded from locale prefixing
 * in src/proxy.ts. Locale therefore comes from resolveAppLocale (cookie /
 * Accept-Language), same as the sibling error page.
 */
export default async function AuthVerifiedPage() {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "profile").auth.verified;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-lg bg-surface-white rounded-card border border-border p-8 shadow-card">
        <TavliLogo className="h-7 w-auto" />
        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-soft">
          <CheckCircle2 size={22} className="text-brand-primary" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl text-text-primary">{m.title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{m.body}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {m.cta}
        </Link>
      </div>
    </div>
  );
}
