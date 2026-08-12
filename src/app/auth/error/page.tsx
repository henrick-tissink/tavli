import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { TavliLogo } from "@/components/tavli-logo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await resolveAppLocale();
  return { title: getMessages(locale, "partner.onboarding").auth.linkError.title };
}

/**
 * Landing page for a failed `exchangeCodeForSession` in `/auth/callback` —
 * an expired, malformed, or already-consumed link. The callback has always
 * redirected here; until now the route did not exist and the user got a 404.
 *
 * Reachable from both the partner confirmation flow and the consumer
 * event-request OTP, so the copy stays neutral and the partner-specific
 * recovery path is offered as a secondary action rather than the headline.
 */
export default async function AuthErrorPage() {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding").auth.linkError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-lg bg-surface-white rounded-card border border-border p-8 shadow-card">
        <TavliLogo className="h-7 w-auto" />
        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-soft">
          <AlertCircle size={22} className="text-brand-primary" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl text-text-primary">{m.title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{m.body}</p>
        <Link
          href="/partner/verify-email"
          className="mt-6 inline-block rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {m.cta}
        </Link>
        <p className="mt-6 text-sm text-text-secondary">
          <Link href="/" className="font-semibold text-brand-primary hover:underline">
            {m.home}
          </Link>
        </p>
      </div>
    </div>
  );
}
