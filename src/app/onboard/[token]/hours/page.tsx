import { redirect } from "next/navigation";
import { DEFAULT_HOURS, getOnboardingState } from "@/lib/onboarding";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { HoursForm } from "@/components/onboarding/HoursForm";

export const dynamic = "force-dynamic";

export default async function OnboardingHoursPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getOnboardingState();
  if (!state) redirect(`/onboard/${token}/account`);

  const initialHours =
    (state.payload.hours && state.payload.hours.length === 7)
      ? state.payload.hours
      : DEFAULT_HOURS;

  return (
    <OnboardingShell currentStepIndex={2} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        When are you open?
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        Set your weekly opening hours. You can change these anytime — and set
        special-date exceptions later in the dashboard.
      </p>
      <HoursForm token={token} initialHours={initialHours} />
    </OnboardingShell>
  );
}
