import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { Button } from "@/components/button";
import { ExternalLink } from "lucide-react";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export const dynamic = "force-dynamic";

export default async function PartnerPreviewPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const restaurantId = await currentUserPrimaryRestaurant(session!);
  const { data: restaurant } = restaurantId
    ? await supabase
        .from("restaurants")
        .select("slug, status, cities(slug)")
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  const citySlug = Array.isArray(restaurant?.cities)
    ? restaurant?.cities[0]?.slug
    : (restaurant?.cities as unknown as { slug: string } | null)?.slug;

  const publicUrl =
    restaurant && citySlug ? `/${citySlug}/${restaurant.slug}` : null;

  return (
    <div className="px-8 py-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Previzualizare
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Vezi ce văd clienții când te găsesc.
        </p>
      </header>

      {publicUrl ? (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="text-sm text-text-secondary">URL-ul tău public:</p>
          <p className="mt-2 font-mono text-sm bg-surface-bg px-3 py-2 rounded">
            {publicUrl}
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={publicUrl} target="_blank">
              <Button>
                <span className="inline-flex items-center gap-2">
                  Deschide pagina publică <ExternalLink size={14} />
                </span>
              </Button>
            </Link>
          </div>
          {restaurant?.status !== "live" && (
            <p className="text-xs text-amber-700 mt-4">
              Notă: statusul restaurantului tău este &quot;{restaurant?.status}&quot; —
              s-ar putea ca pagina publică să nu fie încă vizibilă pentru clienți.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            Nicio pagină publică disponibilă încă
          </p>
          <p className="text-sm text-text-secondary mt-2">
            Publică restaurantul pentru a obține un URL public.
          </p>
        </div>
      )}
    </div>
  );
}
