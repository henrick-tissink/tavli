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
  h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

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
      "id, name, status, hero_note, cuisine, schedule",
    )
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  if (!restaurant) {
    return (
      <div className="px-8 py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">No restaurant yet</p>
          <p className="text-sm text-text-secondary mt-2">
            Your partner account isn&apos;t linked to a restaurant. Contact the
            Tavli team.
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
      label: "Profile complete",
      done:
        !!restaurant.name &&
        !!restaurant.cuisine &&
        restaurant.name !== "New Restaurant",
      hint: "Name, cuisine, address, one-line story",
      href: "/partner/profile",
    },
    {
      label: "Hero photo uploaded",
      done: (heroCount ?? 0) > 0,
      hint: "The first shot diners see",
      href: "/partner/photos",
    },
    {
      label: "At least 3 gallery photos",
      done: (galleryCount ?? 0) >= 3,
      hint: "Interior, signature dishes, atmosphere",
      href: "/partner/photos",
    },
    {
      label: "Hero note set",
      done: !!restaurant.hero_note,
      hint: "One-line restaurant voice on the menu page",
      href: "/partner/profile",
    },
    {
      label: "Menu has at least 6 items",
      done: (menuItemsData?.length ?? 0) >= 6,
      hint: `Currently ${menuSectionsData?.length ?? 0} sections, ${menuItemsData?.length ?? 0} items`,
      href: "/partner/menu",
    },
    {
      label: "Hours configured",
      done: Array.isArray(restaurant.schedule) && restaurant.schedule.length > 0,
      hint: "Your weekly opening times",
      href: "/partner/hours",
    },
    {
      label: "Availability (reservations) set",
      done: (availabilityCount ?? 0) > 0,
      hint: "How many covers per slot",
      href: "/partner/reservations",
    },
  ];

  const greeting = HELLO_BY_HOUR(new Date().getHours());

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-8">
        <p className="text-sm text-text-muted">{greeting},</p>
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight mt-1">
          {restaurant.name}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Status:{" "}
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
              You&apos;re live on Tavli.
            </p>
            <p className="text-sm text-emerald-800 mt-1">
              {restaurant.name} is discoverable by diners right now. Copy your
              consumer page URL to share it.
            </p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 tablet:grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Views this week"
          value="—"
          icon={Eye}
          tone="muted"
          hint="Live when telemetry ships"
        />
        <StatCard
          label="Saves"
          value="—"
          icon={Heart}
          tone="muted"
          hint="Diners who bookmarked you"
        />
        <StatCard
          label="Reservations"
          value="—"
          icon={CalendarClock}
          tone="muted"
          hint="Real bookings arrive in M12"
        />
      </section>

      <ContentHealthChecklist items={checklist} />

      <section className="mt-10 grid grid-cols-1 tablet:grid-cols-2 gap-4">
        <Link
          href="/partner/preview"
          className="bg-surface-white rounded-card border border-border p-5 hover:shadow-card-hover transition-shadow"
        >
          <h3 className="font-display text-lg font-bold text-text-primary">
            View your public page
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            See what diners see when they find you.
          </p>
        </Link>
        <Link
          href="/partner/menu"
          className="bg-surface-white rounded-card border border-border p-5 hover:shadow-card-hover transition-shadow"
        >
          <h3 className="font-display text-lg font-bold text-text-primary">
            Manage menu
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Add sections, dishes, prices, photos, dietary tags.
          </p>
        </Link>
      </section>
    </div>
  );
}
