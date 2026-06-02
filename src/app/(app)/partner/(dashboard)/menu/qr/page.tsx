import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { appOrigin } from "@/lib/app-origin";
import { MenuQrPreview } from "./MenuQrPreview";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

function MissingState({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <div className="bg-surface-white rounded-card border border-border p-10 text-center">
        <p className="font-semibold text-text-primary">{message}</p>
      </div>
    </div>
  );
}

export default async function PartnerMenuQrPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.menu");

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  const { data: row } = restaurantId
    ? await supabase
        .from("restaurants")
        .select("id, slug, name, cities(slug)")
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  if (!row) {
    return <MissingState message={m.page.noRestaurant} />;
  }

  const cityField = row.cities as { slug: string } | { slug: string }[] | null;
  const citySlug = Array.isArray(cityField)
    ? cityField[0]?.slug ?? ""
    : cityField?.slug ?? "";

  if (!citySlug) {
    return <MissingState message={m.qr.noCity} />;
  }

  const menuUrl = `${appOrigin()}/${citySlug}/${row.slug}/menu`;

  return (
    <MenuQrPreview
      restaurant={{
        name: row.name,
        slug: row.slug,
        citySlug,
      }}
      menuUrl={menuUrl}
    />
  );
}
