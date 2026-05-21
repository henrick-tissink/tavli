"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const name = String(formData.get("name") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (!name) return { ok: false, error: "Numele secțiunii este obligatoriu." };

  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

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
  const name = String(formData.get("name") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (!name) return { ok: false, error: "Numele secțiunii este obligatoriu." };

  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

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
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

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
  if (!isUuid(payload.sectionId)) {
    return { ok: false, error: "Alege o secțiune înainte de a salva." };
  }
  if (payload.id !== undefined && !isUuid(payload.id)) {
    return { ok: false, error: "Referință invalidă pentru fel. Reîncarcă pagina." };
  }

  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };
  if (!payload.name.trim()) return { ok: false, error: "Numele este obligatoriu." };
  if (payload.priceLei < 0) return { ok: false, error: "Prețul trebuie să fie ≥ 0." };

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
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

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
