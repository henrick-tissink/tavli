import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { TavliLogo } from "@/components/tavli-logo";

export const dynamic = "force-dynamic";

/**
 * §01 §5.3 — where `/auth/callback` sends an operator after a successful email
 * confirmation. Deliberately a sibling of `verify-email/` rather than a child
 * of the `(dashboard)` group, so it renders as a standalone card instead of
 * being wrapped in dashboard chrome.
 *
 * Server-rendered: the page has no interactivity beyond one link, so it needs
 * no MessagesProvider.
 */
export default async function PartnerVerifiedPage() {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding").auth.verified;

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
          href="/partner"
          className="mt-6 inline-block rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {m.cta}
        </Link>
      </div>
    </div>
  );
}
