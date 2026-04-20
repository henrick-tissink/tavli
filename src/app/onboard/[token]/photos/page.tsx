import Link from "next/link";
import { redirect } from "next/navigation";
import { getOnboardingState, advanceStep } from "@/lib/onboarding";
import { createSupabaseServerClient } from "@/lib/db/server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { PhotoUploader, type PhotoRow } from "@/components/onboarding/PhotoUploader";
import { Button } from "@/components/button";

export const dynamic = "force-dynamic";

async function goToMenu(token: string) {
  "use server";
  await advanceStep("menu");
  redirect(`/onboard/${token}/menu`);
}

export default async function OnboardingPhotosPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getOnboardingState();
  if (!state) redirect(`/onboard/${token}/account`);
  if (!state.restaurantId) redirect(`/onboard/${token}/profile`);

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("restaurant_photos")
    .select("id, storage_path, kind, sort_order")
    .eq("restaurant_id", state.restaurantId)
    .order("sort_order");

  const photos: PhotoRow[] = (existing ?? []).map((p) => ({
    id: p.id,
    storagePath: p.storage_path,
    kind: p.kind,
    sortOrder: p.sort_order,
  }));

  const continueAction = goToMenu.bind(null, token);

  return (
    <OnboardingShell currentStepIndex={3} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        Add some photos
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        One hero photo + a few gallery shots is plenty for now. You can add
        more anytime from the dashboard. Mark your best shot as the hero —
        it&apos;s what diners see first.
      </p>

      <PhotoUploader restaurantId={state.restaurantId} initialPhotos={photos} />

      <div className="flex items-center justify-between gap-3 mt-8">
        <Link
          href={`/onboard/${token}/hours`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          ← Back
        </Link>
        <form action={continueAction}>
          <Button type="submit">Continue</Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
