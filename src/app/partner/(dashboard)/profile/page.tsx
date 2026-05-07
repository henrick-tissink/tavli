import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { PartnerProfileForm } from "@/components/partner/PartnerProfileForm";

export const dynamic = "force-dynamic";

export default async function PartnerProfilePage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, cuisines, address, zone, phone, hero_note, website_url")
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Profil
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Cum este prezentat restaurantul tău clienților.
        </p>
      </header>

      <PartnerProfileForm
        initialValues={{
          name: restaurant?.name,
          cuisines: Array.isArray(restaurant?.cuisines)
            ? (restaurant.cuisines as string[])
            : [],
          address: restaurant?.address,
          zone: restaurant?.zone,
          phone: restaurant?.phone,
          heroNote: restaurant?.hero_note,
          websiteUrl: restaurant?.website_url,
        }}
      />
    </div>
  );
}
