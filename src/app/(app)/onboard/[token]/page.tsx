import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { hashInvitationToken } from "@/lib/invitations";
import { Button } from "@/components/button";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

type ValidationResult =
  | { kind: "valid"; invitation: { email: string; cityName: string | null; proposedName: string | null } }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "claimed" }
  | { kind: "revoked" }
  | { kind: "config_missing" };

async function validateToken(token: string): Promise<ValidationResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { kind: "config_missing" };
  }
  const hash = hashInvitationToken(token);
  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin
    .from("invitations")
    .select("email, status, expires_at, proposed_name, cities(name)")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!invitation) return { kind: "not_found" };
  if (invitation.status === "claimed") return { kind: "claimed" };
  if (invitation.status === "revoked") return { kind: "revoked" };
  const expiresAt = new Date(invitation.expires_at);
  if (expiresAt < new Date()) return { kind: "expired" };

  const cityName = Array.isArray(invitation.cities)
    ? invitation.cities[0]?.name ?? null
    : (invitation.cities as { name: string } | null)?.name ?? null;

  return {
    kind: "valid",
    invitation: {
      email: invitation.email,
      cityName,
      proposedName: invitation.proposed_name,
    },
  };
}

export default async function OnboardingLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await validateToken(token);

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding");
  const l = m.wizard.landing;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-lg bg-surface-white rounded-card border border-border p-8 shadow-card">
        <p className="font-display text-2xl font-bold text-brand-primary tracking-tight">
          Tavli
        </p>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          {l.eyebrow}
        </p>

        {result.kind === "valid" && (
          <>
            <h1 className="font-display text-[32px] font-bold text-text-primary mt-6 leading-tight">
              {l.welcomeTitle}
            </h1>
            <p className="text-sm text-text-secondary mt-3 leading-relaxed">
              {l.intro}
              <strong>{result.invitation.email}</strong>
              {result.invitation.cityName
                ? interpolate(l.introCity, { city: result.invitation.cityName })
                : ""}
              {l.introRest}
            </p>
            <div className="mt-8">
              <Link href={`/onboard/${token}/account`}>
                <Button fullWidth>{l.startCta}</Button>
              </Link>
            </div>
            <p className="text-xs text-text-muted mt-4 text-center">
              {l.haveAccount}{" "}
              <Link href={`/partner/sign-in?invite=${token}`} className="text-brand-primary font-semibold">
                {l.haveAccountLink}
              </Link>
            </p>
          </>
        )}

        {result.kind === "expired" && (
          <ErrorState
            title={l.expiredTitle}
            body={l.expiredBody}
            contactLabel={l.contactLabel}
          />
        )}
        {result.kind === "claimed" && (
          <ErrorState
            title={l.claimedTitle}
            body={l.claimedBody}
            contactLabel={l.contactLabel}
          />
        )}
        {result.kind === "revoked" && (
          <ErrorState
            title={l.revokedTitle}
            body={l.revokedBody}
            contactLabel={l.contactLabel}
          />
        )}
        {result.kind === "not_found" && (
          <ErrorState
            title={l.notFoundTitle}
            body={l.notFoundBody}
            contactLabel={l.contactLabel}
          />
        )}
        {result.kind === "config_missing" && (
          <ErrorState
            title={l.configMissingTitle}
            body={l.configMissingBody}
            contactLabel={l.contactLabel}
          />
        )}
      </div>
    </div>
  );
}

function ErrorState({
  title,
  body,
  contactLabel,
}: {
  title: string;
  body: string;
  contactLabel: string;
}) {
  return (
    <>
      <h1 className="font-display text-[28px] font-bold text-text-primary mt-6 leading-tight">
        {title}
      </h1>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{body}</p>
      <p className="text-xs text-text-muted mt-6">
        {contactLabel}{" "}
        <a href="mailto:hello@tavli.ro" className="text-brand-primary">
          hello@tavli.ro
        </a>
      </p>
    </>
  );
}
