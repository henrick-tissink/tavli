import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantTranslations } from "@/lib/db/schema";
import { TranslationEditor } from "./_components/TranslationEditor";
import type { TranslationFields } from "./actions";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function PartnerTranslationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);
  const m = getMessages(await resolveAppLocale(), "partner.settings").translations;

  if (!restaurantId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-display text-4xl text-text-primary">{m.title}</h1>
        <p className="mt-4 text-sm text-text-secondary">{m.noRestaurant}</p>
      </div>
    );
  }

  const [[base], rows] = await Promise.all([
    dbAdmin
      .select({ description: restaurants.description, heroNote: restaurants.heroNote })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId)),
    dbAdmin
      .select({
        locale: restaurantTranslations.locale,
        tagline: restaurantTranslations.tagline,
        heroSubtitle: restaurantTranslations.heroSubtitle,
        descriptionShort: restaurantTranslations.descriptionShort,
        descriptionLong: restaurantTranslations.descriptionLong,
        chefBio: restaurantTranslations.chefBio,
        ambience: restaurantTranslations.ambience,
      })
      .from(restaurantTranslations)
      .where(
        and(
          eq(restaurantTranslations.restaurantId, restaurantId),
          inArray(restaurantTranslations.locale, ["en", "de"]),
        ),
      ),
  ]);

  const pick = (locale: "en" | "de"): TranslationFields => {
    const r = rows.find((x) => x.locale === locale);
    return {
      tagline: r?.tagline ?? "",
      heroSubtitle: r?.heroSubtitle ?? "",
      descriptionShort: r?.descriptionShort ?? "",
      descriptionLong: r?.descriptionLong ?? "",
      chefBio: r?.chefBio ?? "",
      ambience: r?.ambience ?? "",
    };
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{m.eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl text-text-primary">{m.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {m.subtitle}
        </p>
      </header>

      <div className="mt-8">
        <TranslationEditor
          initial={{ en: pick("en"), de: pick("de") }}
          roReference={{
            tagline: null,
            heroSubtitle: base?.heroNote ?? null,
            descriptionShort: base?.description ?? null,
            descriptionLong: null,
            chefBio: null,
            ambience: null,
          }}
        />
      </div>
    </div>
  );
}
