import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { appOrigin } from "@/lib/app-origin";
import { MenuQrPreview } from "./MenuQrPreview";

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

  const { data: row } = await supabase
    .from("restaurants")
    .select("id, slug, name, cities(slug)")
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  if (!row) {
    return <MissingState message="Niciun restaurant asociat acestui cont." />;
  }

  const cityField = row.cities as { slug: string } | { slug: string }[] | null;
  const citySlug = Array.isArray(cityField)
    ? cityField[0]?.slug ?? ""
    : cityField?.slug ?? "";

  if (!citySlug) {
    return (
      <MissingState message="Restaurantul tău nu este încă asociat unui oraș — contactează echipa de suport ca să rezolvăm asta înainte să tipărești." />
    );
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
