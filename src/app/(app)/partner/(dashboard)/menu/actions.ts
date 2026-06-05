"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE } from "@/lib/uuid";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { isRestaurantBillingLocked } from "@/lib/billing/require-billing-access";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

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

  const { error } = await supabase.from("menu_sections").insert({
    restaurant_id: restaurantId,
    name,
    intro: intro || null,
    sort_order: nextOrder,
  });

  if (error) return { ok: false, error: error.message };
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

export interface SaveItemPayload {
  id?: string;
  sectionId: string;
  name: string;
  description: string;
  priceLei: number;
  dietaryTags: string[];
  isChefPick: boolean;
  isAvailable: boolean;
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
  } else {
    const { data: existing } = await supabase
      .from("menu_items")
      .select("sort_order")
      .eq("section_id", payload.sectionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (existing?.sort_order ?? -1) + 1;

    const { error } = await supabase.from("menu_items").insert({
      section_id: payload.sectionId,
      restaurant_id: restaurantId,
      name: payload.name.trim(),
      description: payload.description.trim() || null,
      price_cents: Math.round(payload.priceLei * 100),
      dietary_tags: payload.dietaryTags,
      is_chef_pick: payload.isChefPick,
      is_available: payload.isAvailable,
      sort_order: nextOrder,
    });
    if (error) return { ok: false, error: error.message };
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
