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

export interface TranslationFields {
  tagline?: string;
  heroSubtitle?: string;
  descriptionShort?: string;
  descriptionLong?: string;
  chefBio?: string;
  ambience?: string;
}

const clean = (v?: string) => (v ?? "").trim() || null;

export async function saveTranslation(
  locale: "en" | "de",
  fields: TranslationFields,
): Promise<SaveTranslationResult> {
  const appLocale = await resolveAppLocale();
  const common = getMessages(appLocale, "partner.common");
  const m = getMessages(appLocale, "partner.settings").translations;
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: common.errors.notAuthenticated };
  if (locale !== "en" && locale !== "de") return { ok: false, error: m.errors.invalidLocale };
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const row = {
    tagline: clean(fields.tagline),
    heroSubtitle: clean(fields.heroSubtitle),
    descriptionShort: clean(fields.descriptionShort),
    descriptionLong: clean(fields.descriptionLong),
    chefBio: clean(fields.chefBio),
    ambience: clean(fields.ambience),
  };

  try {
    await dbAdmin
      .insert(restaurantTranslations)
      .values({ restaurantId, locale, authoredByUserId: session.userId, ...row })
      .onConflictDoUpdate({
        target: [restaurantTranslations.restaurantId, restaurantTranslations.locale],
        set: { ...row, updatedAt: new Date() },
      });
    revalidatePath("/partner/translations");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function toRow(fields: TranslationFields) {
  return {
    tagline: clean(fields.tagline),
    heroSubtitle: clean(fields.heroSubtitle),
    descriptionShort: clean(fields.descriptionShort),
    descriptionLong: clean(fields.descriptionLong),
    chefBio: clean(fields.chefBio),
    ambience: clean(fields.ambience),
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
