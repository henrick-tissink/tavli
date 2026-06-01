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
          Înrolare partener
        </p>

        {result.kind === "valid" && (
          <>
            <h1 className="font-display text-[32px] font-bold text-text-primary mt-6 leading-tight">
              Bun venit la Tavli.
            </h1>
            <p className="text-sm text-text-secondary mt-3 leading-relaxed">
              Am păstrat această invitație pentru{" "}
              <strong>{result.invitation.email}</strong>
              {result.invitation.cityName ? ` în ${result.invitation.cityName}` : ""}
              . Îți configurezi profilul, programul, fotografiile și meniul în câteva minute.
            </p>
            <div className="mt-8">
              <Link href={`/onboard/${token}/account`}>
                <Button fullWidth>Începe configurarea</Button>
              </Link>
            </div>
            <p className="text-xs text-text-muted mt-4 text-center">
              Ai deja un cont Tavli?{" "}
              <Link href={`/partner/sign-in?invite=${token}`} className="text-brand-primary font-semibold">
                Conectează-te
              </Link>
            </p>
          </>
        )}

        {result.kind === "expired" && (
          <ErrorState
            title="Invitația a expirat"
            body="Linkurile de invitație sunt valabile 14 zile. Cere-i persoanei tale de contact de la Tavli una nouă."
          />
        )}
        {result.kind === "claimed" && (
          <ErrorState
            title="Deja acceptată"
            body="Această invitație a fost deja folosită. Dacă vrei să accesezi panoul de partener, conectează-te la /partner/sign-in."
          />
        )}
        {result.kind === "revoked" && (
          <ErrorState
            title="Invitație revocată"
            body="Această invitație nu mai este activă. Contactează echipa Tavli dacă crezi că este o greșeală."
          />
        )}
        {result.kind === "not_found" && (
          <ErrorState
            title="Invitație negăsită"
            body="Acest link nu este recunoscut. Poate a fost scris greșit — copiază și lipește adresa completă din email."
          />
        )}
        {result.kind === "config_missing" && (
          <ErrorState
            title="Platformă neconfigurată"
            body="Tavli încă se configurează. Încearcă din nou în câteva minute sau contactează-ne dacă problema persistă."
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
        <a href="mailto:hello@tavli.ro" className="text-brand-primary">
          hello@tavli.ro
        </a>
      </p>
    </>
  );
}
