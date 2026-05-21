"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { geocode } from "@/lib/geocoding";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

export async function savePartnerProfile(
  _prev: SaveProfileResult | undefined,
  formData: FormData,
): Promise<SaveProfileResult> {
  const supabase = await createSupabaseServerClient();
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

  const profile = {
    name: String(formData.get("name") ?? "").trim(),
    cuisines: formData
      .getAll("cuisines")
      .map((v) => String(v).trim())
      .filter(Boolean),
    address: String(formData.get("address") ?? "").trim(),
    zone: String(formData.get("zone") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    heroNote: String(formData.get("heroNote") ?? "").trim(),
    websiteUrl: String(formData.get("websiteUrl") ?? "").trim(),
  };

  if (!profile.name) return { ok: false, error: "Numele restaurantului este obligatoriu." };
  if (profile.cuisines.length === 0) return { ok: false, error: "Alege cel puțin o bucătărie." };
  if (!profile.address) return { ok: false, error: "Adresa este obligatorie." };

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: profile.name,
      cuisines: profile.cuisines,
      address: profile.address,
      zone: profile.zone || null,
      phone: profile.phone || null,
      hero_note: profile.heroNote || null,
      website_url: profile.websiteUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  if (error) return { ok: false, error: error.message };

  const coords = await geocode(profile.address);
  if (coords) {
    await supabase
      .from("restaurants")
      .update({ lat: coords.lat, lng: coords.lng })
      .eq("id", restaurantId);
  }

  revalidatePath("/partner");
  revalidatePath("/partner/profile");
  return { ok: true };
}
