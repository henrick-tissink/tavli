"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createSupabaseAdminClient, dbAdmin } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { organizations } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";
import { makeStartSubscription } from "@/lib/billing/start-subscription";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { recordBillingAudit } from "@/lib/billing/billing-audit";
import { enqueue } from "@/lib/jobs/enqueue";
import { maybeStartTrial } from "@/lib/billing/onboard-trial-seam";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export interface PublishResult {
  ok: boolean;
  error?: string;
}

export async function publishRestaurant(
  _prev: PublishResult | undefined,
): Promise<PublishResult | void> {
  const locale = await resolveAppLocale();
  const e = getMessages(locale, "partner.onboarding").wizard.errors;

  const supabase = await createSupabaseServerClient();
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: e.notSignedIn };

  const restaurantId = await currentUserPrimaryRestaurant(session);
  const { data: restaurant } = restaurantId
    ? await supabase
        .from("restaurants")
        .select("id, name, cuisines, address, schedule, organization_id")
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  if (!restaurant) return { ok: false, error: e.noRestaurantFound };
  const hasCuisines =
    Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0;
  if (!restaurant.name || !hasCuisines || !restaurant.address) {
    return {
      ok: false,
      error: e.profileIncomplete,
    };
  }
  if (!Array.isArray(restaurant.schedule) || restaurant.schedule.length === 0) {
    return { ok: false, error: e.hoursNotSet };
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

  // §12 §7.1 forward-declared trial-start seam. No-ops today (onboard captures
  // no customer_type); activates when §15/W5-E adds plan + customer_type
  // capture. Never blocks publish — failures (incl. missing STRIPE_SECRET_KEY)
  // are caught + logged. getStripe() is only reached when customer_type is set.
  const orgId = (restaurant as { organization_id?: string }).organization_id;
  if (orgId) {
    try {
      await maybeStartTrial(orgId, {
        loadCustomerType: async (id) => {
          const rows = await dbAdmin
            .select({ ct: organizations.customerType })
            .from(organizations)
            .where(eq(organizations.id, id));
          return rows[0]?.ct ?? null;
        },
        hasActiveSubscription: async (id) => (await loadActiveSubscription(id)) !== null,
        startSubscription: (input) =>
          makeStartSubscription({
            stripe: getStripe(),
            db: dbAdmin,
            enqueue,
            recordBillingAudit,
          })(input),
      });
    } catch (err) {
      console.error("[onboard] maybeStartTrial failed (non-fatal)", err);
    }
  }

  redirect("/partner?justPublished=1");
}
