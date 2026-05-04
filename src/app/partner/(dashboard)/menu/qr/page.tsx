import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { MenuQrPreview } from "./MenuQrPreview";

export const dynamic = "force-dynamic";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
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
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            No restaurant linked to this account.
          </p>
        </div>
      </div>
    );
  }

  const cityField = row.cities as { slug: string } | { slug: string }[] | null;
  const citySlug = Array.isArray(cityField)
    ? cityField[0]?.slug ?? ""
    : cityField?.slug ?? "";

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
