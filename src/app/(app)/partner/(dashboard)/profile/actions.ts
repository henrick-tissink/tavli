"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { geocode } from "@/lib/geocoding";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { isRestaurantBillingLocked } from "@/lib/billing/require-billing-access";
import { normalizePhone } from "@/lib/phone/normalize";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

export async function savePartnerProfile(
  _prev: SaveProfileResult | undefined,
  formData: FormData,
): Promise<SaveProfileResult> {
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const m = getMessages(locale, "partner.settings").profile;
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: common.errors.notAuthenticated };

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

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

  if (!profile.name) return { ok: false, error: m.errors.nameRequired };
  if (profile.cuisines.length === 0) return { ok: false, error: m.errors.cuisineRequired };
  if (!profile.address) return { ok: false, error: m.errors.addressRequired };

  // §02 §4.7: normalise restaurant phone to E.164. Optional field — empty
  // → null; invalid → reject.
  let phoneE164: string | null = null;
  if (profile.phone) {
    const phoneResult = normalizePhone(profile.phone);
    if (phoneResult.ok) {
      phoneE164 = phoneResult.e164;
    } else if (phoneResult.reason === "invalid") {
      return { ok: false, error: m.errors.phoneInvalid };
    }
  }

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: profile.name,
      cuisines: profile.cuisines,
      address: profile.address,
      zone: profile.zone || null,
      phone: phoneE164,
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
