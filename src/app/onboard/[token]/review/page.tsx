import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Star, MapPin } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getOnboardingState } from "@/lib/onboarding";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { PublishButton } from "@/components/onboarding/PublishButton";
import { ReviewPolicyDisclosure } from "@/components/onboarding/review-policy-disclosure";
import { resolvePhotoUrl } from "@/lib/storage";
import { formatCuisines } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OnboardingReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await getOnboardingState();
  if (!state) redirect(`/onboard/${token}/account`);
  if (!state.restaurantId) redirect(`/onboard/${token}/profile`);

  const supabase = await createSupabaseServerClient();
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, cuisines, zone, address, hero_note, schedule, cities(name)")
    .eq("id", state.restaurantId)
    .maybeSingle();

  const { data: heroPhoto } = await supabase
    .from("restaurant_photos")
    .select("storage_path")
    .eq("restaurant_id", state.restaurantId)
    .eq("kind", "hero")
    .maybeSingle();

  const heroUrl = resolvePhotoUrl(heroPhoto?.storage_path ?? null);
  const cityName = Array.isArray(restaurant?.cities)
    ? restaurant?.cities[0]?.name
    : (restaurant?.cities as unknown as { name: string } | null)?.name;
  const cuisinesLabel = formatCuisines(
    Array.isArray(restaurant?.cuisines)
      ? (restaurant.cuisines as string[])
      : [],
  );

  return (
    <OnboardingShell currentStepIndex={5} token={token}>
      <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
        Gata de lansare?
      </h1>
      <p className="text-sm text-text-secondary mt-2 mb-6 leading-relaxed">
        Așa va arăta restaurantul tău pentru oaspeți. Apasă Publică și vei
        apărea în {cityName ?? "orașul tău"} în câteva secunde.
      </p>

      {/* Preview card */}
      <div className="bg-surface-white rounded-card border border-border overflow-hidden shadow-card">
        <div className="relative aspect-[16/9] bg-surface-bg">
          {heroUrl ? (
            <Image
              src={heroUrl}
              alt={restaurant?.name ?? ""}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 680px, 100vw"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center p-6">
              <span className="font-display text-white text-2xl font-bold text-center">
                {restaurant?.name ?? "Restaurantul tău"}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">
              {cuisinesLabel} · Meniu
            </p>
            <h2 className="font-display text-3xl font-bold mt-1 leading-tight">
              {restaurant?.name}
            </h2>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {restaurant?.hero_note && (
            <p className="italic text-sm text-text-secondary leading-relaxed">
              {restaurant.hero_note}
            </p>
          )}
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="inline-flex items-center gap-1 font-bold bg-surface-bg text-text-primary rounded-pill px-2.5 py-0.5">
              4.5
              <Star size={12} className="fill-brand-primary text-brand-primary" />
            </span>
            <span className="text-text-muted">{cuisinesLabel}</span>
            {restaurant?.zone && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">{restaurant.zone}</span>
              </>
            )}
          </div>
          {restaurant?.address && (
            <p className="text-sm text-text-secondary flex items-start gap-1">
              <MapPin size={14} className="flex-shrink-0 mt-0.5" />
              {restaurant.address}
            </p>
          )}
          {Array.isArray(restaurant?.schedule) && restaurant.schedule.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Program
              </p>
              <ul className="text-xs text-text-secondary space-y-0.5">
                {(restaurant.schedule as { days: string; hours: string }[]).map((s, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{s.days}</span>
                    <span>{s.hours}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ReviewPolicyDisclosure />

      <div className="mt-8">
        <PublishButton />
      </div>

      <div className="text-center mt-4">
        <Link
          href={`/onboard/${token}/menu`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          ← Înapoi
        </Link>
      </div>
    </OnboardingShell>
  );
}
