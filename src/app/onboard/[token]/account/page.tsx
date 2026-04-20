import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { hashInvitationToken } from "@/lib/invitations";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { AccountForm } from "@/components/onboarding/AccountForm";

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

  return (
    <OnboardingShell currentStepIndex={0} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        Create your account
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        One account is all you need. We&apos;ll use this email for reservation
        alerts and any important platform notices.
      </p>
      <AccountForm
        token={token}
        emailHint={invitation.email}
        proposedName={invitation.proposed_name}
      />
    </OnboardingShell>
  );
}
