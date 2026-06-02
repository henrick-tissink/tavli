import Link from "next/link";
import { redirect } from "next/navigation";
import { getOnboardingState, advanceStep } from "@/lib/onboarding";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/button";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

async function goToReview(token: string) {
  "use server";
  await advanceStep("review");
  redirect(`/onboard/${token}/review`);
}

export default async function OnboardingMenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getOnboardingState();
  if (!state) redirect(`/onboard/${token}/account`);

  const continueAction = goToReview.bind(null, token);

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding");

  return (
    <OnboardingShell currentStepIndex={4} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        {m.wizard.menu.title}
      </h1>
      <p className="text-sm text-text-secondary mt-2 leading-relaxed">
        {m.wizard.menu.subtitle}
      </p>

      <div className="bg-surface-white rounded-card border border-border p-6 mt-8">
        <h2 className="font-display text-lg font-bold text-text-primary">
          {m.wizard.menu.cardTitle}
        </h2>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          {m.wizard.menu.cardBody}
        </p>
        <p className="text-xs text-text-muted mt-3">
          {m.wizard.menu.cardNote}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mt-8">
        <Link
          href={`/onboard/${token}/photos`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          {m.wizard.menu.back}
        </Link>
        <form action={continueAction}>
          <Button type="submit">{m.wizard.menu.skip}</Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
