import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { PhotoUploader, type PhotoRow } from "@/components/onboarding/PhotoUploader";
import { MenuPhotosSection, type DishPhoto } from "@/components/partner/MenuPhotosSection";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { resolvePhotoUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function PartnerPhotosPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.settings").photos;

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            {m.noRestaurantTitle}
          </p>
          <p className="text-sm text-text-secondary mt-2">
            {m.noRestaurantBody}
          </p>
        </div>
      </div>
    );
  }

  const { data: existing } = await supabase
    .from("restaurant_photos")
    .select("id, storage_path, kind, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order");

  const photos: PhotoRow[] = (existing ?? []).map((p) => ({
    id: p.id,
    storagePath: p.storage_path,
    kind: p.kind,
    sortOrder: p.sort_order,
  }));

  // Dish photos for the read-only "Menu" section (owned by menu_items).
  const { data: dishRows } = await supabase
    .from("menu_items")
    .select("id, name, photo_storage_path, sort_order")
    .eq("restaurant_id", restaurantId)
    .not("photo_storage_path", "is", null)
    .order("sort_order");

  const dishPhotos: DishPhoto[] = (dishRows ?? [])
    .map((d) => ({ id: d.id, name: d.name, photoUrl: resolvePhotoUrl(d.photo_storage_path) ?? "" }))
    .filter((d) => d.photoUrl);

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          {m.title}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {m.subtitle}
        </p>
      </header>

      <section>
        <h2 className="font-display text-xl font-bold text-text-primary mb-4">
          {m.restaurantSectionTitle}
        </h2>
        <PhotoUploader restaurantId={restaurantId} initialPhotos={photos} />
      </section>

      <MenuPhotosSection dishes={dishPhotos} locale={locale} />
    </div>
  );
}
