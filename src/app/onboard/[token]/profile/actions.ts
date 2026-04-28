"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { advanceStep, mergeDraftPayload } from "@/lib/onboarding";
import { geocode } from "@/lib/geocoding";

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

export async function saveProfile(
  token: string,
  _prev: SaveProfileResult | undefined,
  formData: FormData,
): Promise<SaveProfileResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

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

  if (!profile.name) return { ok: false, error: "Restaurant name is required." };
  if (profile.cuisines.length === 0) return { ok: false, error: "Pick at least one cuisine." };
  if (!profile.address) return { ok: false, error: "Address is required." };

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
    .eq("owner_user_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Geocode the address. Failure is non-fatal — listing still saves; the map
  // simply won't render until coords are filled in (e.g., via backfill).
  const coords = await geocode(profile.address);
  if (coords) {
    await supabase
      .from("restaurants")
      .update({ lat: coords.lat, lng: coords.lng })
      .eq("owner_user_id", user.id);
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
