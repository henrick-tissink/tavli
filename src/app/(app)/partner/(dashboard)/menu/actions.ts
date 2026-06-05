"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { UUID_RE } from "@/lib/uuid";
import { createSupabaseServerClient } from "@/lib/db/server";
import { dbAdmin } from "@/lib/db/admin";
import { menuItemTranslations, menuSectionTranslations } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { isRestaurantBillingLocked } from "@/lib/billing/require-billing-access";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

/**
 * Upsert/clear per-locale section translations (name + intro). Written via the
 * service-role client — these tables carry only admin-read RLS, so the partner
 * SSR client can't touch them (mirrors the restaurant-translations editor).
 * The caller has already authorized the owner for this section.
 */
async function upsertSectionTranslations(
  sectionId: string,
  formData: FormData,
): Promise<void> {
  for (const locale of ["en", "de"] as const) {
    const name = String(formData.get(`name_${locale}`) ?? "").trim();
    const intro = String(formData.get(`intro_${locale}`) ?? "").trim();
    if (!name && !intro) {
      await dbAdmin
        .delete(menuSectionTranslations)
        .where(
          and(
            eq(menuSectionTranslations.sectionId, sectionId),
            eq(menuSectionTranslations.locale, locale),
          ),
        );
    } else {
      await dbAdmin
        .insert(menuSectionTranslations)
        .values({ sectionId, locale, name: name || null, intro: intro || null })
        .onConflictDoUpdate({
          target: [menuSectionTranslations.sectionId, menuSectionTranslations.locale],
          set: { name: name || null, intro: intro || null, updatedAt: new Date() },
        });
    }
  }
}

async function ownerRestaurantId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return currentUserPrimaryRestaurant(session);
}

export interface Ok {
  ok: boolean;
  error?: string;
}

// ── sections ──────────────────────────────────────────────────────────────

export async function createSection(formData: FormData): Promise<Ok> {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.menu");
  const common = getMessages(locale, "partner.common");
  const name = String(formData.get("name") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (!name) return { ok: false, error: m.errors.sectionNameRequired };

  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("menu_sections")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.sort_order ?? -1) + 1;

  // Ensure menus row exists (1:1 with restaurants).
  await supabase
    .from("menus")
    .upsert({ restaurant_id: restaurantId }, { onConflict: "restaurant_id" });

  const { data: created, error } = await supabase
    .from("menu_sections")
    .insert({
      restaurant_id: restaurantId,
      name,
      intro: intro || null,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  if (created) await upsertSectionTranslations(created.id, formData);
  revalidatePath("/partner/menu");
  revalidatePath("/partner");
  return { ok: true };
}

export async function updateSection(
  sectionId: string,
  formData: FormData,
): Promise<Ok> {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.menu");
  const common = getMessages(locale, "partner.common");
  const name = String(formData.get("name") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (!name) return { ok: false, error: m.errors.sectionNameRequired };

  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("menu_sections")
    .update({ name, intro: intro || null })
    .eq("id", sectionId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };
  await upsertSectionTranslations(sectionId, formData);
  revalidatePath("/partner/menu");
  return { ok: true };
}

export async function deleteSection(sectionId: string): Promise<Ok> {
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("menu_sections")
    .delete()
    .eq("id", sectionId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/menu");
  revalidatePath("/partner");
  return { ok: true };
}

// ── items ─────────────────────────────────────────────────────────────────

interface LocaleText {
  name: string;
  description: string;
}

export interface SaveItemPayload {
  id?: string;
  sectionId: string;
  name: string;
  description: string;
  priceLei: number;
  dietaryTags: string[];
  isChefPick: boolean;
  isAvailable: boolean;
  translations?: { en: LocaleText; de: LocaleText };
}

/**
 * Upsert (or clear) per-locale dish translations. Empty name+description for a
 * locale removes the row → diner menu falls back to the Romanian base. Only
 * name/description are written, leaving any alt_text on the row intact.
 * Service-role: these tables carry only admin-read RLS (see section helper).
 */
async function upsertItemTranslations(
  itemId: string,
  translations: { en: LocaleText; de: LocaleText } | undefined,
): Promise<void> {
  if (!translations) return;
  for (const locale of ["en", "de"] as const) {
    const name = translations[locale].name.trim();
    const description = translations[locale].description.trim();
    if (!name && !description) {
      await dbAdmin
        .delete(menuItemTranslations)
        .where(
          and(
            eq(menuItemTranslations.itemId, itemId),
            eq(menuItemTranslations.locale, locale),
          ),
        );
    } else {
      await dbAdmin
        .insert(menuItemTranslations)
        .values({ itemId, locale, name: name || null, description: description || null })
        .onConflictDoUpdate({
          target: [menuItemTranslations.itemId, menuItemTranslations.locale],
          set: { name: name || null, description: description || null, updatedAt: new Date() },
        });
    }
  }
}

export async function saveItem(payload: SaveItemPayload): Promise<Ok> {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.menu");
  const common = getMessages(locale, "partner.common");
  if (!isUuid(payload.sectionId)) {
    return { ok: false, error: m.errors.chooseSection };
  }
  if (payload.id !== undefined && !isUuid(payload.id)) {
    return { ok: false, error: m.errors.invalidItemRef };
  }

  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };
  if (!payload.name.trim()) return { ok: false, error: m.errors.nameRequired };
  if (payload.priceLei < 0) return { ok: false, error: m.errors.priceNonNegative };

  const supabase = await createSupabaseServerClient();

  if (payload.id) {
    const { error } = await supabase
      .from("menu_items")
      .update({
        section_id: payload.sectionId,
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        price_cents: Math.round(payload.priceLei * 100),
        dietary_tags: payload.dietaryTags,
        is_chef_pick: payload.isChefPick,
        is_available: payload.isAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.id)
      .eq("restaurant_id", restaurantId);
    if (error) return { ok: false, error: error.message };
    await upsertItemTranslations(payload.id, payload.translations);
  } else {
    const { data: existing } = await supabase
      .from("menu_items")
      .select("sort_order")
      .eq("section_id", payload.sectionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (existing?.sort_order ?? -1) + 1;

    const { data: created, error } = await supabase
      .from("menu_items")
      .insert({
        section_id: payload.sectionId,
        restaurant_id: restaurantId,
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        price_cents: Math.round(payload.priceLei * 100),
        dietary_tags: payload.dietaryTags,
        is_chef_pick: payload.isChefPick,
        is_available: payload.isAvailable,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (created) {
      await upsertItemTranslations(created.id, payload.translations);
    }
  }

  revalidatePath("/partner/menu");
  revalidatePath("/partner");
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<Ok> {
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/menu");
  revalidatePath("/partner");
  return { ok: true };
}
