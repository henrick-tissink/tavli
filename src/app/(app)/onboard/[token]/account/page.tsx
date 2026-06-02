import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { hashInvitationToken } from "@/lib/invitations";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { AccountForm } from "@/components/onboarding/AccountForm";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function OnboardingAccountPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(`/onboard/${token}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin
    .from("invitations")
    .select("email, status, expires_at, proposed_name")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  if (
    !invitation ||
    invitation.status !== "pending" ||
    new Date(invitation.expires_at) < new Date()
  ) {
    redirect(`/onboard/${token}`);
  }

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding");

  return (
    <OnboardingShell currentStepIndex={0} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        {m.wizard.account.title}
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        {m.wizard.account.subtitle}
      </p>
      <AccountForm
        token={token}
        emailHint={invitation.email}
        proposedName={invitation.proposed_name}
      />
    </OnboardingShell>
  );
}
