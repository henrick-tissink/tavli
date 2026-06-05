import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  MenuEditor,
  type MenuSectionData,
} from "@/components/partner/MenuEditor";
import { PrintQrButton } from "./PrintQrButton";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { resolvePhotoUrl } from "@/lib/storage";
import { dbAdmin } from "@/lib/db/admin";
import { menuItemTranslations, menuSectionTranslations } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface SectionTrRow { section_id: string; locale: string; name: string | null; intro: string | null }
interface ItemTrRow { item_id: string; locale: string; name: string | null; description: string | null }

const emptySectionTr = () => ({ en: { name: "", intro: "" }, de: { name: "", intro: "" } });
const emptyItemTr = () => ({ en: { name: "", description: "" }, de: { name: "", description: "" } });

function buildSectionTrMap(rows: SectionTrRow[]) {
  const map = new Map<string, ReturnType<typeof emptySectionTr>>();
  for (const r of rows) {
    if (r.locale !== "en" && r.locale !== "de") continue;
    const entry = map.get(r.section_id) ?? emptySectionTr();
    entry[r.locale] = { name: r.name ?? "", intro: r.intro ?? "" };
    map.set(r.section_id, entry);
  }
  return map;
}

function buildItemTrMap(rows: ItemTrRow[]) {
  const map = new Map<string, ReturnType<typeof emptyItemTr>>();
  for (const r of rows) {
    if (r.locale !== "en" && r.locale !== "de") continue;
    const entry = map.get(r.item_id) ?? emptyItemTr();
    entry[r.locale] = { name: r.name ?? "", description: r.description ?? "" };
    map.set(r.item_id, entry);
  }
  return map;
}

export default async function PartnerMenuPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.menu");

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            {m.page.noRestaurant}
          </p>
        </div>
      </div>
    );
  }

  const { data: sectionsRaw } = await supabase
    .from("menu_sections")
    .select("id, name, intro, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order");

  const { data: itemsRaw } = await supabase
    .from("menu_items")
    .select(
      "id, section_id, name, description, price_cents, dietary_tags, is_chef_pick, is_available, sort_order, photo_storage_path",
    )
    .eq("restaurant_id", restaurantId)
    .order("sort_order");

  // Existing EN/DE translations, to pre-fill the inline editors. Read via the
  // service-role client: these tables carry only admin-read RLS, so the partner
  // SSR client sees no rows (same reason the writes use dbAdmin).
  const sectionIds = (sectionsRaw ?? []).map((s) => s.id);
  const itemIds = (itemsRaw ?? []).map((i) => i.id);
  const [sectionTr, itemTr] = await Promise.all([
    sectionIds.length
      ? dbAdmin
          .select({
            section_id: menuSectionTranslations.sectionId,
            locale: menuSectionTranslations.locale,
            name: menuSectionTranslations.name,
            intro: menuSectionTranslations.intro,
          })
          .from(menuSectionTranslations)
          .where(inArray(menuSectionTranslations.sectionId, sectionIds))
      : Promise.resolve([] as SectionTrRow[]),
    itemIds.length
      ? dbAdmin
          .select({
            item_id: menuItemTranslations.itemId,
            locale: menuItemTranslations.locale,
            name: menuItemTranslations.name,
            description: menuItemTranslations.description,
          })
          .from(menuItemTranslations)
          .where(inArray(menuItemTranslations.itemId, itemIds))
      : Promise.resolve([] as ItemTrRow[]),
  ]);

  const sectionTrMap = buildSectionTrMap(sectionTr as SectionTrRow[]);
  const itemTrMap = buildItemTrMap(itemTr as ItemTrRow[]);

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
        photoUrl: resolvePhotoUrl(i.photo_storage_path),
        translations: itemTrMap.get(i.id) ?? emptyItemTr(),
      })),
    translations: sectionTrMap.get(s.id) ?? emptySectionTr(),
  }));

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
            {m.page.title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {m.page.subtitle}
          </p>
        </div>
        <PrintQrButton menuItemCount={(itemsRaw ?? []).length} />
      </header>

      <MenuEditor sections={sections} restaurantId={restaurantId} />
    </div>
  );
}
