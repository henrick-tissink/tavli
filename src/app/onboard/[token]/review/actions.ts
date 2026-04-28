"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

export interface PublishResult {
  ok: boolean;
  error?: string;
}

export async function publishRestaurant(
  _prev: PublishResult | undefined,
): Promise<PublishResult | void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, cuisines, address, schedule")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!restaurant) return { ok: false, error: "No restaurant found for your account." };
  const hasCuisines =
    Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0;
  if (!restaurant.name || !hasCuisines || !restaurant.address) {
    return {
      ok: false,
      error: "Profile isn't complete. Go back and fill in name, cuisines, and address.",
    };
  }
  if (!Array.isArray(restaurant.schedule) || restaurant.schedule.length === 0) {
    return { ok: false, error: "Hours aren't set. Go back to the Hours step." };
  }

  // Status change is column-restricted from `authenticated` — use the
  // service-role client.
  const admin = createSupabaseAdminClient();
  const nextStatus = process.env.ONBOARDING_REVIEW_REQUIRED === "true"
    ? "pending_review"
    : "live";

  const { error } = await admin
    .from("restaurants")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", restaurant.id);

  if (error) return { ok: false, error: error.message };

  redirect("/partner?justPublished=1");
}
