import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { PhotoUploader, type PhotoRow } from "@/components/onboarding/PhotoUploader";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export const dynamic = "force-dynamic";

export default async function PartnerPhotosPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  const { data: restaurant } = restaurantId
    ? await supabase
        .from("restaurants")
        .select("id")
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            Niciun restaurant asociat acestui cont încă
          </p>
          <p className="text-sm text-text-secondary mt-2">
            Contactează echipa Tavli dacă ai ajuns aici din greșeală.
          </p>
        </div>
      </div>
    );
  }

  const { data: existing } = await supabase
    .from("restaurant_photos")
    .select("id, storage_path, kind, sort_order")
    .eq("restaurant_id", restaurant.id)
    .order("sort_order");

  const photos: PhotoRow[] = (existing ?? []).map((p) => ({
    id: p.id,
    storagePath: p.storage_path,
    kind: p.kind,
    sortOrder: p.sort_order,
  }));

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Fotografii
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Încarcă fotografii noi, alege una principală, șterge-le pe cele
          care nu îți plac.
        </p>
      </header>

      <PhotoUploader restaurantId={restaurant.id} initialPhotos={photos} />
    </div>
  );
}
