import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { Button } from "@/components/button";
import { ExternalLink } from "lucide-react";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

export default async function PartnerPreviewPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const m = getMessages(await resolveAppLocale(), "partner.settings").preview;
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
          {m.title}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {m.subtitle}
        </p>
      </header>

      {publicUrl ? (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="text-sm text-text-secondary">{m.publicUrlLabel}</p>
          <p className="mt-2 font-mono text-sm bg-surface-bg px-3 py-2 rounded">
            {publicUrl}
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={publicUrl} target="_blank">
              <Button>
                <span className="inline-flex items-center gap-2">
                  {m.openPublicPage} <ExternalLink size={14} />
                </span>
              </Button>
            </Link>
          </div>
          {restaurant?.status !== "live" && (
            <p className="text-xs text-amber-700 mt-4">
              {interpolate(m.statusNote, { status: restaurant?.status ?? "" })}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            {m.noPublicPageTitle}
          </p>
          <p className="text-sm text-text-secondary mt-2">
            {m.noPublicPageBody}
          </p>
        </div>
      )}
    </div>
  );
}
