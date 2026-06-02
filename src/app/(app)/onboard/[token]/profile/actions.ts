"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { advanceStep, mergeDraftPayload } from "@/lib/onboarding";
import { geocode } from "@/lib/geocoding";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { normalizePhone } from "@/lib/phone/normalize";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

export async function saveProfile(
  token: string,
  _prev: SaveProfileResult | undefined,
  formData: FormData,
): Promise<SaveProfileResult> {
  const locale = await resolveAppLocale();
  const e = getMessages(locale, "partner.onboarding").wizard.errors;

  const supabase = await createSupabaseServerClient();
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: e.notSignedIn };

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) {
    return { ok: false, error: e.noRestaurantFound };
  }

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

  if (!profile.name) return { ok: false, error: e.restaurantNameRequired };
  if (profile.cuisines.length === 0) return { ok: false, error: e.pickCuisine };
  if (!profile.address) return { ok: false, error: e.addressRequired };

  // §02 §4.7: normalise restaurant phone to E.164. Optional — empty stays null;
  // invalid rejects.
  let phoneE164: string | null = null;
  if (profile.phone) {
    const phoneResult = normalizePhone(profile.phone);
    if (phoneResult.ok) {
      phoneE164 = phoneResult.e164;
    } else if (phoneResult.reason === "invalid") {
      return { ok: false, error: e.phoneInvalid };
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

  // Geocode the address. Failure is non-fatal — listing still saves; the map
  // simply won't render until coords are filled in (e.g., via backfill).
  const coords = await geocode(profile.address);
  if (coords) {
    await supabase
      .from("restaurants")
      .update({ lat: coords.lat, lng: coords.lng })
      .eq("id", restaurantId);
  }

  await mergeDraftPayload({ profile });
  await advanceStep("hours");

  redirect(`/onboard/${token}/hours`);
}

export async function autosaveProfileField(
  field: string,
  value: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await mergeDraftPayload({
    profile: { [field]: value } as Record<string, string>,
  });
}
