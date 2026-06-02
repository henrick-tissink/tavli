import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function OnboardingProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getOnboardingState();
  if (!state) redirect(`/onboard/${token}/account`);

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding");

  return (
    <OnboardingShell currentStepIndex={1} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        {m.wizard.profile.title}
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        {m.wizard.profile.subtitle}
      </p>
      <ProfileForm token={token} initialValues={state.payload.profile ?? {}} />
    </OnboardingShell>
  );
}
