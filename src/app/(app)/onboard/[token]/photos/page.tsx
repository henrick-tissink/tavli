import Link from "next/link";
import { redirect } from "next/navigation";
import { getOnboardingState, advanceStep } from "@/lib/onboarding";
import { createSupabaseServerClient } from "@/lib/db/server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { PhotoUploader, type PhotoRow } from "@/components/onboarding/PhotoUploader";
import { Button } from "@/components/button";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

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

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding");

  return (
    <OnboardingShell currentStepIndex={3} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        {m.wizard.photos.title}
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-relaxed">
        {m.wizard.photos.subtitle}
      </p>

      <PhotoUploader restaurantId={state.restaurantId} initialPhotos={photos} />

      <div className="flex items-center justify-between gap-3 mt-8">
        <Link
          href={`/onboard/${token}/hours`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          {m.wizard.photos.back}
        </Link>
        <form action={continueAction}>
          <Button type="submit">{m.wizard.photos.continue}</Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
