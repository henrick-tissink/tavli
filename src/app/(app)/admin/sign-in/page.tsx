import Image from "next/image";
import Link from "next/link";
import { SignInForm } from "@/components/admin/SignInForm";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  listVerifiedTotpFactors,
  countUnconsumedRecoveryCodes,
} from "@/lib/auth/mfa";
import type { SignInResult } from "@/app/(app)/admin/sign-in/actions";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/messages-provider";

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ continue_mfa?: string }>;
}) {
  // Honor `?continue_mfa=1` from the proxy: when an AAL1 session with a
  // verified factor lands here we skip the password step and render the
  // MFA step directly. If there's no live session we fall through to the
  // password form (graceful degradation — the user must re-authenticate).
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "admin.auth");
  const bundle = buildBundle(locale, ["ui", "admin.common", "admin.auth"]);

  const params = (await searchParams) ?? {};
  let initialState: SignInResult | undefined;
  if (params.continue_mfa === "1" && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const factors = await listVerifiedTotpFactors(supabase);
      if (factors.length > 0) {
        const remaining = await countUnconsumedRecoveryCodes(userData.user.id);
        initialState = {
          ok: false,
          state: "needs_mfa",
          factorId: factors[0].id,
          hasRecoveryCodes: remaining > 0,
        };
      }
    }
  }

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="min-h-screen flex flex-col desktop:flex-row">
        {/* Left panel — desktop only */}
        <div className="hidden desktop:flex desktop:w-1/2 bg-gradient-to-br from-brand-primary-soft via-white to-white p-12 items-center justify-center">
          <div className="flex flex-col items-center max-w-md w-full">
            <div className="self-start">
              <Link
                href="/admin"
                className="font-display text-3xl font-bold text-brand-primary tracking-tight"
              >
                Tavli
              </Link>
              <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
                {m.page.brandEyebrow}
              </p>
            </div>
            <Image
              src="/illustrations/partner-dining.svg"
              alt=""
              width={300}
              height={218}
              className="mt-8 w-[300px] max-w-full h-auto object-contain"
              aria-hidden="true"
              unoptimized
            />
            <h2 className="font-display text-2xl font-bold text-text-primary mt-6 self-start">
              {m.page.panelHeading}
            </h2>
            <p className="text-sm text-text-secondary mt-2 self-start">
              {m.page.restrictedNotice}
            </p>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 bg-surface-bg">
          <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-10 shadow-card">
            {/* Mobile wordmark — hidden on desktop */}
            <div className="flex items-center justify-center mb-6 desktop:hidden">
              <div className="w-12 h-12 rounded-full bg-brand-primary-soft flex items-center justify-center">
                <Link
                  href="/admin"
                  className="font-display text-xl font-bold text-brand-primary tracking-tight"
                >
                  T
                </Link>
              </div>
            </div>
            <div className="mb-6">
              <h1 className="font-display text-[28px] font-bold text-text-primary">
                {m.page.title}
              </h1>
            </div>
            <SignInForm initialState={initialState} />
          </div>
        </div>
      </div>
    </MessagesProvider>
  );
}
