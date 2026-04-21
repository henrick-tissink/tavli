import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { PhotoUploader, type PhotoRow } from "@/components/onboarding/PhotoUploader";

export const dynamic = "force-dynamic";

export default async function PartnerPhotosPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            No restaurant linked to this account yet
          </p>
          <p className="text-sm text-text-secondary mt-2">
            Contact the Tavli team if you reached this in error.
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
          Photos
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Upload new shots, mark a hero, remove ones you don&apos;t love.
        </p>
      </header>

      <PhotoUploader restaurantId={restaurant.id} initialPhotos={photos} />
    </div>
  );
}
