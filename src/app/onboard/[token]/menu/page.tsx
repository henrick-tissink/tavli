import Link from "next/link";
import { redirect } from "next/navigation";
import { getOnboardingState, advanceStep } from "@/lib/onboarding";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/button";

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

  return (
    <OnboardingShell currentStepIndex={4} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        Menu — up to you
      </h1>
      <p className="text-sm text-text-secondary mt-2 leading-relaxed">
        You can add your menu right now, or skip this step and use the full
        menu editor from your dashboard — most partners skip and fill it in
        later.
      </p>

      <div className="bg-surface-white rounded-card border border-border p-6 mt-8">
        <h2 className="font-display text-lg font-bold text-text-primary">
          Full editor in the dashboard
        </h2>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          The partner menu editor lets you build sections, add dishes with
          photos, tag vegetarian / gluten-free / spicy, and mark chef&apos;s
          picks — all with autosave.
        </p>
        <p className="text-xs text-text-muted mt-3">
          For beta, the editor arrives alongside the partner dashboard (M10).
          Your listing can go live without a menu — diners see
          &quot;Menu coming soon&quot; on the detail page.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mt-8">
        <Link
          href={`/onboard/${token}/photos`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          ← Back
        </Link>
        <form action={continueAction}>
          <Button type="submit">Skip & continue to review</Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
