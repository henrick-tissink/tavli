import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { hashInvitationToken } from "@/lib/invitations";
import { Button } from "@/components/button";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-lg bg-surface-white rounded-card border border-border p-8 shadow-card">
        <p className="font-display text-2xl font-bold text-brand-primary tracking-tight">
          Tavli
        </p>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          Partner onboarding
        </p>

        {result.kind === "valid" && (
          <>
            <h1 className="font-display text-[32px] font-bold text-text-primary mt-6 leading-tight">
              Welcome to Tavli.
            </h1>
            <p className="text-sm text-text-secondary mt-3 leading-relaxed">
              We&apos;ve saved this invitation for{" "}
              <strong>{result.invitation.email}</strong>
              {result.invitation.cityName ? ` in ${result.invitation.cityName}` : ""}
              . Set up your profile, hours, photos, and menu in about 10
              minutes.
            </p>
            <div className="mt-8">
              <Link href={`/onboard/${token}/account`}>
                <Button fullWidth>Start onboarding</Button>
              </Link>
            </div>
            <p className="text-xs text-text-muted mt-4 text-center">
              Already have a Tavli account?{" "}
              <Link href={`/partner/sign-in?invite=${token}`} className="text-brand-primary font-semibold">
                Sign in instead
              </Link>
            </p>
          </>
        )}

        {result.kind === "expired" && (
          <ErrorState
            title="This invitation has expired"
            body="Invitation links are valid for 14 days. Ask your Tavli contact for a new one."
          />
        )}
        {result.kind === "claimed" && (
          <ErrorState
            title="Already accepted"
            body="This invitation has already been used. If you need to access your partner dashboard, sign in at /partner/sign-in."
          />
        )}
        {result.kind === "revoked" && (
          <ErrorState
            title="Invitation revoked"
            body="This invitation is no longer active. Contact the Tavli team if you think this is a mistake."
          />
        )}
        {result.kind === "not_found" && (
          <ErrorState
            title="Invitation not found"
            body="This link isn't recognised. It may have been typed incorrectly — copy and paste the full URL from the email."
          />
        )}
        {result.kind === "config_missing" && (
          <ErrorState
            title="Platform not configured"
            body="Tavli is still setting up. Please try again in a few minutes, or contact us if the issue persists."
          />
        )}
      </div>
    </div>
  );
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="font-display text-[28px] font-bold text-text-primary mt-6 leading-tight">
        {title}
      </h1>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{body}</p>
      <p className="text-xs text-text-muted mt-6">
        Contact:{" "}
        <a href="mailto:hello@tavli.app" className="text-brand-primary">
          hello@tavli.app
        </a>
      </p>
    </>
  );
}
