import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantTranslations } from "@/lib/db/schema";
import { TranslationEditor } from "./_components/TranslationEditor";
import type { TranslationFields } from "./actions";

export const dynamic = "force-dynamic";

export default async function PartnerTranslationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);

  if (!restaurantId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-4xl text-text-primary">Traduceri</h1>
        <p className="mt-4 text-sm text-text-secondary">Niciun restaurant asociat contului.</p>
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
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Pagina de local</p>
        <h1 className="mt-2 font-display text-4xl text-text-primary">Traduceri</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Pagina ta în engleză și germană — fiecare un original paralel, nu o traducere. Câmpurile goale
          revin la versiunea românească.
        </p>
      </header>

      <div className="mt-8">
        <TranslationEditor
          initial={{ en: pick("en"), de: pick("de") }}
          roReference={{ descriptionShort: base?.description ?? null, heroSubtitle: base?.heroNote ?? null }}
        />
      </div>
    </div>
  );
}
