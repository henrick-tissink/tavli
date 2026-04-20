"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { advanceStep, mergeDraftPayload } from "@/lib/onboarding";

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
    cuisine: String(formData.get("cuisine") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    zone: String(formData.get("zone") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    heroNote: String(formData.get("heroNote") ?? "").trim(),
    websiteUrl: String(formData.get("websiteUrl") ?? "").trim(),
  };

  if (!profile.name) return { ok: false, error: "Restaurant name is required." };
  if (!profile.cuisine) return { ok: false, error: "Cuisine is required." };
  if (!profile.address) return { ok: false, error: "Address is required." };

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: profile.name,
      cuisine: profile.cuisine,
      address: profile.address,
      zone: profile.zone || null,
      phone: profile.phone || null,
      hero_note: profile.heroNote || null,
      website_url: profile.websiteUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_user_id", user.id);

  if (error) return { ok: false, error: error.message };

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
