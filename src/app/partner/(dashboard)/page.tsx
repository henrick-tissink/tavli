import Link from "next/link";
import { Eye, Heart, CalendarClock, PartyPopper } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { StatCard } from "@/components/admin/StatCard";
import {
  ContentHealthChecklist,
  type ChecklistItem,
} from "@/components/partner/ContentHealthChecklist";

export const dynamic = "force-dynamic";

const HELLO_BY_HOUR = (h: number) =>
  h < 5
    ? "Bună noaptea"
    : h < 12
      ? "Bună dimineața"
      : h < 18
        ? "Bună ziua"
        : "Bună seara";

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ justPublished?: string }>;
}) {
  const { justPublished } = await searchParams;
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select(
      "id, name, status, hero_note, cuisines, schedule",
    )
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">Niciun restaurant încă</p>
          <p className="text-sm text-text-secondary mt-2">
            Contul tău de partener nu este asociat unui restaurant.
            Contactează echipa Tavli.
          </p>
        </div>
      </div>
    );
  }

  const [
    { count: heroCount },
    { count: galleryCount },
    { data: menuSectionsData },
    { data: menuItemsData },
    { count: availabilityCount },
  ] = await Promise.all([
    supabase
      .from("restaurant_photos")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("kind", "hero"),
    supabase
      .from("restaurant_photos")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .in("kind", ["gallery", "dish", "venue"]),
    supabase
      .from("menu_sections")
      .select("id", { count: "exact" })
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("menu_items")
      .select("id", { count: "exact" })
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("restaurant_availability")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
  ]);

  const checklist: ChecklistItem[] = [
    {
      label: "Profil complet",
      done:
        !!restaurant.name &&
        Array.isArray(restaurant.cuisines) &&
        restaurant.cuisines.length > 0 &&
        restaurant.name !== "New Restaurant",
      hint: "Nume, bucătării, adresă, descriere scurtă",
      href: "/partner/profile",
    },
    {
      label: "Fotografie principală încărcată",
      done: (heroCount ?? 0) > 0,
      hint: "Prima imagine pe care o văd clienții",
      href: "/partner/photos",
    },
    {
      label: "Cel puțin 3 fotografii în galerie",
      done: (galleryCount ?? 0) >= 3,
      hint: "Interior, feluri de semnătură, atmosferă",
      href: "/partner/photos",
    },
    {
      label: "Notă pe meniu setată",
      done: !!restaurant.hero_note,
      hint: "Vocea restaurantului pe pagina de meniu",
      href: "/partner/profile",
    },
    {
      label: "Meniul are cel puțin 6 feluri",
      done: (menuItemsData?.length ?? 0) >= 6,
      hint: `În prezent ${menuSectionsData?.length ?? 0} secțiuni, ${menuItemsData?.length ?? 0} ${(menuItemsData?.length ?? 0) === 1 ? "fel" : "feluri"}`,
      href: "/partner/menu",
    },
    {
      label: "Program configurat",
      done: Array.isArray(restaurant.schedule) && restaurant.schedule.length > 0,
      hint: "Programul tău săptămânal",
      href: "/partner/hours",
    },
    {
      label: "Disponibilitate (rezervări) setată",
      done: (availabilityCount ?? 0) > 0,
      hint: "Câți clienți pe interval",
      href: "/partner/reservations",
    },
  ];

  const greeting = HELLO_BY_HOUR(new Date().getHours());

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-5xl">
      <header className="mb-8">
        <p className="text-sm text-text-muted">{greeting},</p>
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight mt-1">
          {restaurant.name}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Stare:{" "}
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              restaurant.status === "live"
                ? "text-emerald-700"
                : "text-amber-700"
            }`}
          >
            {restaurant.status === "live" ? "● Live" : `● ${restaurant.status}`}
          </span>
        </p>
      </header>

      {justPublished === "1" && (
        <div className="rounded-card border border-emerald-200 bg-emerald-50 p-5 mb-8 flex items-start gap-3">
          <PartyPopper size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">
              Ești live pe Tavli.
            </p>
            <p className="text-sm text-emerald-800 mt-1">
              {restaurant.name} poate fi descoperit chiar acum de către
              clienți. Copiază URL-ul paginii publice pentru a-l împărtăși.
            </p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 tablet:grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Vizualizări săptămâna asta"
          value="—"
          icon={Eye}
          tone="muted"
          hint="Disponibil odată cu telemetria"
        />
        <StatCard
          label="Salvări"
          value="—"
          icon={Heart}
          tone="muted"
          hint="Clienți care te-au salvat"
        />
        <StatCard
          label="Rezervări"
          value="—"
          icon={CalendarClock}
          tone="muted"
          hint="Vezi rezervările reale în secțiunea Rezervări"
        />
      </section>

      <ContentHealthChecklist items={checklist} />

      <section className="mt-10 grid grid-cols-1 tablet:grid-cols-2 gap-4">
        <Link
          href="/partner/preview"
          className="bg-surface-white rounded-card border border-border p-5 hover:shadow-card-hover transition-shadow"
        >
          <h3 className="font-display text-lg font-bold text-text-primary">
            Vezi pagina ta publică
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Vezi ce văd clienții când te găsesc.
          </p>
        </Link>
        <Link
          href="/partner/menu"
          className="bg-surface-white rounded-card border border-border p-5 hover:shadow-card-hover transition-shadow"
        >
          <h3 className="font-display text-lg font-bold text-text-primary">
            Administrează meniul
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Adaugă secțiuni, feluri, prețuri, fotografii, etichete dietetice.
          </p>
        </Link>
      </section>
    </div>
  );
}
