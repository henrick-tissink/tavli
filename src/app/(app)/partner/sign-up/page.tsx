import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { cities } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { SignUpForm } from "./SignUpForm";

export const dynamic = "force-dynamic";

export default async function PartnerSignUpPage() {
  // Already signed in → straight to the portal.
  const session = await getCurrentSession();
  if (session) redirect("/partner");

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding").auth;
  const bundle = buildBundle(locale, ["ui", "partner.common", "partner.onboarding"]);

  const cityRows = await dbAdmin
    .select({ id: cities.id, name: cities.name })
    .from(cities)
    .where(eq(cities.isActive, true))
    .orderBy(asc(cities.name));

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
    <div className="min-h-screen flex flex-col desktop:flex-row">
      {/* Left panel — desktop only */}
      <div className="hidden desktop:flex desktop:w-1/2 bg-gradient-to-br from-brand-primary-soft via-white to-white p-12 items-center justify-center">
        <div className="flex flex-col items-center max-w-md w-full">
          <div className="self-start">
            <Link href="/partner" className="font-display text-3xl font-bold text-brand-primary tracking-tight">
              Tavli
            </Link>
            <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">{m.brandPartner}</p>
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
            {m.signUp.heroHeading}
          </h2>
          <p className="text-sm text-text-secondary mt-2 self-start">
            {m.signUp.heroBody}
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-surface-bg">
        <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-8 desktop:p-10 shadow-card">
          <div className="flex items-center justify-center mb-6 desktop:hidden">
            <div className="w-12 h-12 rounded-full bg-brand-primary-soft flex items-center justify-center">
              <Link href="/partner" className="font-display text-xl font-bold text-brand-primary tracking-tight">
                T
              </Link>
            </div>
          </div>
          <div className="mb-6">
            <h1 className="font-display text-[28px] font-bold text-text-primary">{m.signUp.title}</h1>
            <p className="text-sm text-text-secondary mt-1">
              {m.signUp.haveAccount}{" "}
              <Link href="/partner/sign-in" className="text-brand-primary hover:underline font-medium">
                {m.signUp.haveAccountLink}
              </Link>
            </p>
          </div>
          <SignUpForm cities={cityRows} />
        </div>
      </div>
    </div>
    </MessagesProvider>
  );
}
