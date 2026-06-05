"use server";

/**
 * §05 — partner translations editor. Upserts the EN/DE `restaurant_translations`
 * rows for the partner's primary venue (RO is the base, stored on `restaurants`).
 * Follows the established profile-action convention (session + primary venue).
 */
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { isRestaurantBillingLocked } from "@/lib/billing/require-billing-access";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTranslations } from "@/lib/db/schema";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export interface SaveTranslationResult {
  ok: boolean;
  error?: string;
}

/**
 * The translatable restaurant-page fields that actually render on the diner
 * site: hero subtitle (→ heroNote) and the short/long description (→ the page
 * description). Other restaurant_translations columns (tagline, chefBio,
 * ambience, name) render nowhere and are intentionally not managed here, so we
 * never write them.
 */
export interface TranslationFields {
  heroSubtitle?: string;
  descriptionShort?: string;
  descriptionLong?: string;
}

const clean = (v?: string) => (v ?? "").trim() || null;

function toRow(fields: TranslationFields) {
  return {
    heroSubtitle: clean(fields.heroSubtitle),
    descriptionShort: clean(fields.descriptionShort),
    descriptionLong: clean(fields.descriptionLong),
  };
}

/**
 * Save the English and German translation rows together (one authorization
 * check, one revalidate). RO is the source and is edited on Profile, so it is
 * not written here.
 */
export async function saveTranslations(payload: {
  en: TranslationFields;
  de: TranslationFields;
}): Promise<SaveTranslationResult> {
  const appLocale = await resolveAppLocale();
  const common = getMessages(appLocale, "partner.common");
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: common.errors.notAuthenticated };
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  try {
    for (const locale of ["en", "de"] as const) {
      const row = toRow(payload[locale]);
      await dbAdmin
        .insert(restaurantTranslations)
        .values({ restaurantId, locale, authoredByUserId: session.userId, ...row })
        .onConflictDoUpdate({
          target: [restaurantTranslations.restaurantId, restaurantTranslations.locale],
          set: { ...row, updatedAt: new Date() },
        });
    }
    revalidatePath("/partner/translations");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
