import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { ProfileForm } from "@/components/onboarding/ProfileForm";

export const dynamic = "force-dynamic";

export default async function OnboardingProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getOnboardingState();
  if (!state) redirect(`/onboard/${token}/account`);

  return (
    <OnboardingShell currentStepIndex={1} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        Tell us about the restaurant
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        These basics show on your listing and menu. You can edit everything
        later from the partner dashboard.
      </p>
      <ProfileForm token={token} initialValues={state.payload.profile ?? {}} />
    </OnboardingShell>
  );
}
