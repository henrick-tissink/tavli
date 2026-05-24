"use server";

/**
 * §05 — partner translations editor. Upserts the EN/DE `restaurant_translations`
 * rows for the partner's primary venue (RO is the base, stored on `restaurants`).
 * Follows the established profile-action convention (session + primary venue).
 */
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTranslations } from "@/lib/db/schema";

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
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };
  if (locale !== "en" && locale !== "de") return { ok: false, error: "Limbă invalidă." };
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

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
