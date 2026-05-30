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
        Meniul — cum vrei tu
      </h1>
      <p className="text-sm text-text-secondary mt-2 leading-relaxed">
        Poți adăuga meniul chiar acum sau poți sări peste acest pas și folosi
        editorul complet din panou — majoritatea partenerilor sar peste și îl
        completează mai târziu.
      </p>

      <div className="bg-surface-white rounded-card border border-border p-6 mt-8">
        <h2 className="font-display text-lg font-bold text-text-primary">
          Editor complet în panou
        </h2>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          Editorul de meniu pentru parteneri îți permite să creezi secțiuni, să
          adaugi feluri cu fotografii, să marchezi vegetarian / fără gluten /
          picant și să evidențiezi recomandările bucătarului — totul cu salvare
          automată.
        </p>
        <p className="text-xs text-text-muted mt-3">
          În beta, editorul vine odată cu panoul de partener (M10). Pagina ta
          poate fi publicată și fără meniu — oaspeții văd „Meniu în curând” pe
          pagina restaurantului.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mt-8">
        <Link
          href={`/onboard/${token}/photos`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          ← Înapoi
        </Link>
        <form action={continueAction}>
          <Button type="submit">Sari peste și mergi la verificare</Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
