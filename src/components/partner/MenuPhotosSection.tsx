import Image from "next/image";
import Link from "next/link";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

export interface DishPhoto {
  id: string;
  name: string;
  photoUrl: string;
}

/**
 * Read-only overview of dish photos on the Photos page. Dish photos are owned
 * by the dish (menu_items.photo_storage_path), so each thumbnail links back to
 * the menu editor focused on that dish rather than being editable here.
 */
export function MenuPhotosSection({
  dishes,
  locale,
}: {
  dishes: DishPhoto[];
  locale: Locale;
}) {
  const m = getMessages(locale, "partner.settings").photos;

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {m.menuSectionTitle}
      </h2>
      <p className="text-sm text-text-secondary mt-1 mb-4">
        {m.menuSectionSubtitle}
      </p>

      {dishes.length === 0 ? (
        <p className="text-sm text-text-muted italic">{m.menuSectionEmpty}</p>
      ) : (
        <div className="grid grid-cols-2 desktop:grid-cols-3 gap-3">
          {dishes.map((dish) => (
            <Link
              key={dish.id}
              href={`/partner/menu?dish=${dish.id}`}
              className="group relative rounded-card overflow-hidden bg-surface-bg aspect-[4/3] border border-border"
              title={m.editInMenu}
            >
              <Image
                src={dish.photoUrl}
                alt={dish.name}
                fill
                className="object-cover transition-transform group-hover:scale-105"
                sizes="(min-width: 1024px) 200px, 50vw"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] font-semibold text-white line-clamp-1">
                {dish.name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
