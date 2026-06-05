import Link from "next/link";
import { Eye, Heart, CalendarClock, PartyPopper } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { StatCard } from "@/components/admin/StatCard";
import {
  ContentHealthChecklist,
  type ChecklistItem,
} from "@/components/partner/ContentHealthChecklist";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getOverviewStats } from "@/lib/repos/overview-stats";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { translate, interpolate } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

const greetingKey = (h: number): "morning" | "day" | "evening" | "night" =>
  h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "day" : "evening";

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ justPublished?: string }>;
}) {
  const { justPublished } = await searchParams;
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.dashboard");

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  const { data: restaurant } = restaurantId
    ? await supabase
        .from("restaurants")
        .select(
          "id, name, status, hero_note, cuisines, schedule",
        )
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">{m.noRestaurant.title}</p>
          <p className="text-sm text-text-secondary mt-2">
            {m.noRestaurant.body}
          </p>
        </div>
      </div>
    );
  }

  const [
    // Stat-card counts (null in mock mode → cards keep their "—" stubs).
    stats,
    { count: heroCount },
    { count: galleryCount },
    { data: menuSectionsData },
    { data: menuItemsData },
    { count: availabilityCount },
  ] = await Promise.all([
    getOverviewStats(restaurant.id),
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

  const sectionCount = menuSectionsData?.length ?? 0;
  const itemCount = menuItemsData?.length ?? 0;

  const checklist: ChecklistItem[] = [
    {
      label: m.checklist.profileLabel,
      done:
        !!restaurant.name &&
        Array.isArray(restaurant.cuisines) &&
        restaurant.cuisines.length > 0 &&
        restaurant.name !== "New Restaurant",
      hint: m.checklist.profileHint,
      href: "/partner/profile",
    },
    {
      label: m.checklist.heroLabel,
      done: (heroCount ?? 0) > 0,
      hint: m.checklist.heroHint,
      href: "/partner/photos",
    },
    {
      label: m.checklist.galleryLabel,
      done: (galleryCount ?? 0) >= 3,
      hint: m.checklist.galleryHint,
      href: "/partner/photos",
    },
    {
      label: m.checklist.heroNoteLabel,
      done: !!restaurant.hero_note,
      hint: m.checklist.heroNoteHint,
      href: "/partner/profile",
    },
    {
      label: m.checklist.menuLabel,
      done: itemCount >= 6,
      hint: interpolate(m.checklist.menuHint, {
        sections: translate(locale, m.checklist.menuHintSections, {
          count: sectionCount,
        }),
        items: translate(locale, m.checklist.menuHintItems, {
          count: itemCount,
        }),
      }),
      href: "/partner/menu",
    },
    {
      label: m.checklist.scheduleLabel,
      done: Array.isArray(restaurant.schedule) && restaurant.schedule.length > 0,
      hint: m.checklist.scheduleHint,
      href: "/partner/hours",
    },
    {
      label: m.checklist.availabilityLabel,
      done: (availabilityCount ?? 0) > 0,
      hint: m.checklist.availabilityHint,
      href: "/partner/reservations",
    },
  ];

  const greeting = m.greeting[greetingKey(new Date().getHours())];

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-5xl">
      <header className="mb-8">
        <p className="text-sm text-text-muted">{greeting},</p>
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight mt-1">
          {restaurant.name}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {m.header.statusLabel}{" "}
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              restaurant.status === "live"
                ? "text-emerald-700"
                : "text-amber-700"
            }`}
          >
            {restaurant.status === "live" ? m.header.live : `● ${restaurant.status}`}
          </span>
        </p>
      </header>

      {justPublished === "1" && (
        <div className="rounded-card border border-emerald-200 bg-emerald-50 p-5 mb-8 flex items-start gap-3">
          <PartyPopper size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">
              {m.justPublished.title}
            </p>
            <p className="text-sm text-emerald-800 mt-1">
              {interpolate(m.justPublished.body, { name: restaurant.name })}
            </p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 tablet:grid-cols-3 gap-4 mb-10">
        <StatCard
          label={m.stats.viewsLabel}
          value={stats ? stats.viewsThisWeek.toLocaleString(locale) : "—"}
          icon={Eye}
          tone={stats ? "default" : "muted"}
          hint={stats ? undefined : m.stats.viewsHint}
        />
        <StatCard
          label={m.stats.savesLabel}
          value={stats ? stats.saves.toLocaleString(locale) : "—"}
          icon={Heart}
          tone={stats ? "default" : "muted"}
          hint={m.stats.savesHint}
        />
        <StatCard
          label={m.stats.reservationsLabel}
          value={stats ? stats.upcomingReservations.toLocaleString(locale) : "—"}
          icon={CalendarClock}
          tone={stats ? "default" : "muted"}
          hint={m.stats.reservationsHint}
        />
      </section>

      <ContentHealthChecklist
        items={checklist}
        title={m.checklist.title}
        progressTemplate={m.checklist.progress}
      />

      <section className="mt-10 grid grid-cols-1 tablet:grid-cols-2 gap-4">
        <Link
          href="/partner/preview"
          className="bg-surface-white rounded-card border border-border p-5 hover:shadow-card-hover transition-shadow"
        >
          <h3 className="font-display text-lg font-bold text-text-primary">
            {m.cta.previewTitle}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {m.cta.previewBody}
          </p>
        </Link>
        <Link
          href="/partner/menu"
          className="bg-surface-white rounded-card border border-border p-5 hover:shadow-card-hover transition-shadow"
        >
          <h3 className="font-display text-lg font-bold text-text-primary">
            {m.cta.menuTitle}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {m.cta.menuBody}
          </p>
        </Link>
      </section>
    </div>
  );
}
