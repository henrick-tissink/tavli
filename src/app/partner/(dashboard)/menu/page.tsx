import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  MenuEditor,
  type MenuSectionData,
} from "@/components/partner/MenuEditor";
import { PrintQrButton } from "./PrintQrButton";

export const dynamic = "force-dynamic";

export default async function PartnerMenuPage() {
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
            No restaurant linked to this account.
          </p>
        </div>
      </div>
    );
  }

  const { data: sectionsRaw } = await supabase
    .from("menu_sections")
    .select("id, name, intro, sort_order")
    .eq("restaurant_id", restaurant.id)
    .order("sort_order");

  const { data: itemsRaw } = await supabase
    .from("menu_items")
    .select(
      "id, section_id, name, description, price_cents, dietary_tags, is_chef_pick, is_available, sort_order",
    )
    .eq("restaurant_id", restaurant.id)
    .order("sort_order");

  const sections: MenuSectionData[] = (sectionsRaw ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    intro: s.intro,
    sortOrder: s.sort_order,
    items: (itemsRaw ?? [])
      .filter((i) => i.section_id === s.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        priceCents: i.price_cents,
        dietaryTags: i.dietary_tags ?? [],
        isChefPick: i.is_chef_pick,
        isAvailable: i.is_available,
        sortOrder: i.sort_order,
      })),
  }));

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
            Menu
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Sections, dishes, prices, dietary tags, chef&apos;s picks. Changes
            show on your public page immediately.
          </p>
        </div>
        <PrintQrButton menuItemCount={(itemsRaw ?? []).length} />
      </header>

      <MenuEditor sections={sections} />
    </div>
  );
}
