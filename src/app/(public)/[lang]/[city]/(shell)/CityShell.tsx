"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Restaurant } from "@/lib/types";
import { TopNav } from "@/components/top-nav";
import { TabBar } from "@/components/tab-bar";
import { MapFab } from "@/components/map-fab";
import { SearchOverlay } from "@/components/search-overlay";
import {
  FilterProvider,
  useFilters,
} from "@/lib/filter-context";
import { TimeContextProvider } from "@/lib/time-context";
import { AuthProvider } from "@/lib/auth-context";
import { SavedProvider } from "@/lib/saved-context";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { type Locale } from "@/lib/i18n/locale";
import { localizedHref } from "@/lib/i18n/routing";

interface CityShellProps {
  lang: Locale;
  bundle: Record<string, Record<string, unknown>>;
  city: string;
  displayCity: string;
  restaurants: Restaurant[];
  children: React.ReactNode;
}

function Inner({
  lang,
  city,
  restaurants,
  children,
}: Omit<CityShellProps, "displayCity">) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const { setFilter } = useFilters();

  // Every shell destination is a force-dynamic, DB-backed route, so the push
  // takes a server round-trip. Without a transition the tap produces nothing at
  // all: `activeTab` below is derived from `pathname`, which does not change
  // until the new page commits.
  const [isNavigating, startNavigation] = useTransition();
  // Optimistic destination, so the tapped tab lights up on press instead of
  // when the route lands. Only read while the transition is in flight — once it
  // settles the pathname-derived state is authoritative again.
  const [navTarget, setNavTarget] = useState<{
    href: string;
    tab: string | null;
  } | null>(null);
  const pendingNav = isNavigating ? navTarget : null;

  const navigate = (href: string, tab: string | null = null) => {
    // Repeat taps on the destination already in flight are no-ops.
    if (pendingNav?.href === href) return;
    setNavTarget({ href, tab });
    startNavigation(() => router.push(href));
  };

  const activeTab = pathname.includes("/map")
    ? "map"
    : pathname.includes("/saved")
      ? "saved"
      : pathname.includes("/profile")
        ? "profile"
        : "discover";

  // FAB shown only on list/discovery routes — not on map (already there) or
  // detail/menu pages (collides with sticky Book a Table CTA).
  const KNOWN_TABS = new Set(["map", "saved", "profile"]);
  const segments = pathname.split("/").filter(Boolean);
  // When the path is locale-prefixed, the city segment is at index 1 (after
  // the lang segment), so the tab check must skip the lang segment.
  const citySegmentIndex = segments[0] && ["ro", "en", "de"].includes(segments[0]) ? 1 : 0;
  const hasRestaurantSlug =
    segments.length >= citySegmentIndex + 2 && !KNOWN_TABS.has(segments[citySegmentIndex + 1]);
  const isMapPage = activeTab === "map";
  const showMapFab = !hasRestaurantSlug && !isMapPage;

  return (
    <>
      {/* Route-change indicator. The desktop TopNav icons have no room for a
          per-control spinner, so the shell carries the signal. Kept out of the
          a11y tree — `aria-busy` on <main> is what assistive tech reads — and
          it is a solid bar, not a motion-only cue, so the reduced-motion guard
          in globals.css cannot hide it. */}
      {isNavigating && (
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-[60] h-0.5 bg-brand-primary animate-pulse desktop:top-16"
        />
      )}
      <TopNav
        lang={lang}
        pathname={pathname}
        currentSlug={city}
        onCityChange={() => {}}
        onSearchFocus={() => setSearchOpen(true)}
        onSavedClick={() => navigate(localizedHref(`/${city}/saved`, lang), "saved")}
        onProfileClick={() =>
          navigate(localizedHref(`/${city}/profile`, lang), "profile")
        }
      />
      <main
        aria-busy={isNavigating || undefined}
        className="pb-20 desktop:pb-0 desktop:pt-16"
      >
        {children}
      </main>
      <TabBar
        activeTab={pendingNav?.tab ?? activeTab}
        onTabChange={(tab) => {
          if (tab === "discover") navigate(localizedHref(`/${city}`, lang), "discover");
          else if (tab === "map") navigate(localizedHref(`/${city}/map`, lang), "map");
          else if (tab === "search") setSearchOpen(true);
          else if (tab === "saved") navigate(localizedHref(`/${city}/saved`, lang), "saved");
          else if (tab === "profile")
            navigate(localizedHref(`/${city}/profile`, lang), "profile");
        }}
      />
      {showMapFab && (
        <MapFab onClick={() => navigate(localizedHref(`/${city}/map`, lang), "map")} />
      )}
      <SearchOverlay
        open={searchOpen}
        restaurants={restaurants}
        onClose={() => setSearchOpen(false)}
        onSelectRestaurant={(restaurant) => {
          setSearchOpen(false);
          navigate(localizedHref(`/${city}/${restaurant.slug}`, lang));
        }}
        onSelectCuisine={(cuisine) => {
          setFilter("cuisines", [cuisine]);
          setSearchOpen(false);
        }}
      />
    </>
  );
}

export function CityShell(props: CityShellProps) {
  return (
    <MessagesProvider locale={props.lang} bundle={props.bundle}>
      <AuthProvider>
        <SavedProvider>
          <FilterProvider>
            <TimeContextProvider>
              <Inner {...props} />
            </TimeContextProvider>
          </FilterProvider>
        </SavedProvider>
      </AuthProvider>
    </MessagesProvider>
  );
}
