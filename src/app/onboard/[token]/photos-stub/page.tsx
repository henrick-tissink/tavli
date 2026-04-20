import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Button } from "@/components/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OnboardingPhotosStubPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <OnboardingShell currentStepIndex={3} token={token}>
      <div className="bg-surface-white rounded-card border border-border p-10 text-center">
        <h1 className="font-display text-[28px] font-bold text-text-primary leading-tight">
          Almost there — photos & menu arrive with M7
        </h1>
        <p className="text-sm text-text-secondary mt-3 leading-relaxed max-w-md mx-auto">
          Hours saved. The final three steps (photos, menu, publish) land in the
          next milestone of the build. Your draft restaurant record is live in the
          DB and waiting for them.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link href={`/onboard/${token}/hours`}>
            <Button variant="secondary">Edit hours</Button>
          </Link>
          <Link href="/partner">
            <Button>Go to partner dashboard</Button>
          </Link>
        </div>
      </div>
    </OnboardingShell>
  );
}
