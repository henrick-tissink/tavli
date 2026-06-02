import { type Locale, DEFAULT_LOCALE, isLocale } from "./locale";

import roCommon from "@/messages/ro/common.json";
import enCommon from "@/messages/en/common.json";
import deCommon from "@/messages/de/common.json";

import roDiscovery from "@/messages/ro/discovery.json";
import enDiscovery from "@/messages/en/discovery.json";
import deDiscovery from "@/messages/de/discovery.json";

import roRestaurant from "@/messages/ro/restaurant.json";
import enRestaurant from "@/messages/en/restaurant.json";
import deRestaurant from "@/messages/de/restaurant.json";

import roMenu from "@/messages/ro/menu.json";
import enMenu from "@/messages/en/menu.json";
import deMenu from "@/messages/de/menu.json";

/** Structural contract for the `common` namespace. */
export interface CommonMessages {
  languageName: string;
  switchLanguage: string;
  locales: Record<Locale, string>;
  cities: Record<string, string>;
}

/** Structural contract for the `discovery` namespace. */
export interface DiscoveryMessages {
  search: {
    placeholder: string;
    back: string;
    recentTitle: string;
    clearAll: string;
    trendingTitle: string;
    categoriesTitle: string;
    resultsRestaurants: string;
    resultsCuisines: string;
    noResults: string;
    cuisineCount: { one: string; few: string; other: string };
    trending: { bbq: string; rooftop: string; brunch: string; newOpenings: string };
    categories: {
      pizza: string; japanese: string; steak: string; vegan: string;
      coffee: string; cocktails: string; burgers: string; fish: string;
    };
  };
  filters: {
    all: string;
    openNow: string;
    privateEvent: string;
    cuisine: string;
    price: string;
    neighborhood: string;
    more: string;
    moreAriaLabel: string;
    title: string;
    reset: string;
    minRating: string;
    ratingAny: string;
    noResults: string;
    showResults: { one: string; few: string; other: string };
    priceAccessible: string;
    priceModerate: string;
    pricePremium: string;
    priceExclusive: string;
  };
  feed: {
    noMatchTitle: string;
    noMatchBody: string;
    resetFilters: string;
    trendingTitle: string;
    trendingSubtitle: string;
    availableTodayTitle: string;
    availableTodaySubtitle: string;
    newTitle: string;
    newSubtitle: string;
    weekRestaurant: string;
    availableToday: string;
    viewRestaurant: string;
  };
  map: {
    searchPlaceholder: string;
    filters: string;
    closeMap: string;
  };
  card: {
    saveAriaLabel: string;
    viewAriaLabel: string;
    privateEventBadge: string;
    reviews: { one: string; few: string; other: string };
    topDimension: string;
  };
  cover: {
    tagline: string;
    availableCount: { one: string; few: string; other: string };
    availableIntro: string;
    searchCta: string;
  };
  dietary: {
    vegan: string;
    vegetarian: string;
    glutenFree: string;
    spicy: string;
    clear: string;
  };
  tabs: {
    discover: string;
    map: string;
    search: string;
    saved: string;
    profile: string;
    navAriaLabel: string;
  };
  nav: {
    logoAriaLabel: string;
    searchPlaceholder: string;
    savedAriaLabel: string;
    profileAriaLabel: string;
  };
}

/** Structural contract for the `restaurant` namespace. */
export interface RestaurantMessages {
  notFound: { title: string; back: string };
  detail: {
    availableToday: string;
    noSlotsTitle: string;
    noSlotsBody: string;
    bookOtherDay: string;
    readMore: string;
    showLess: string;
    chefPicksTitle: string;
    chefPicksSubtitle: string;
    viewMenu: string;
    viewMenuLabel: string;
    viewMenuFull: string;
    viewMenuRecommendations: { one: string; few: string; other: string };
    reviewsTitle: string;
    reviewsSubtitle: string;
    scheduleTitle: string;
    scheduleSubtitle: string;
    locationTitle: string;
    locationSubtitle: string;
    directionsLink: string;
    nearbyTitle: string;
    nearbySubtitle: string;
    bookTable: string;
    stickyBookCta: string;
    stickyNextSlot: string;
  };
  gallery: { backAriaLabel: string; saveAriaLabel: string; shareAriaLabel: string };
  reviewCard: {
    bookedContext: string;
    guestOne: string;
    guestOther: string;
    helpful: string;
    restaurantReply: string;
  };
  reviewIntelligence: {
    title: string;
    basedOn: { one: string; few: string; other: string };
    topMentionsTitle: string;
    bestForTitle: string;
  };
}

/** Structural contract for the `menu` namespace. */
export interface MenuMessages {
  viewer: {
    backAriaLabel: string;
    menuLabel: string;
    dishesCount: { one: string; few: string; other: string };
    priceRange: string;
    chefPicksTitle: string;
    chefPicksCount: { one: string; few: string; other: string };
    viewItem: string;
    noMatchBody: string;
    clearFilters: string;
  };
  itemCard: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
  };
  itemSheet: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
    chefNoteTitle: string;
    chefNoteBody: string;
    moreFromSection: string;
  };
  pageClient: {
    noMenuTitle: string;
    noMenuBody: string;
    backTo: string;
  };
}

/**
 * Registry of namespaces. Each entry is Record<Locale, NsMessages>, so a missing
 * key in any locale is a TypeScript error at build time (the locked completeness
 * contract). Add new namespaces here as later phases extract strings.
 */
const CATALOGS = {
  common: { ro: roCommon, en: enCommon, de: deCommon } as Record<
    Locale,
    CommonMessages
  >,
  discovery: { ro: roDiscovery, en: enDiscovery, de: deDiscovery } as Record<
    Locale,
    DiscoveryMessages
  >,
  restaurant: { ro: roRestaurant, en: enRestaurant, de: deRestaurant } as Record<
    Locale,
    RestaurantMessages
  >,
  menu: { ro: roMenu, en: enMenu, de: deMenu } as Record<
    Locale,
    MenuMessages
  >,
} as const;

export type Namespace = keyof typeof CATALOGS;
export const NAMESPACES = Object.keys(CATALOGS) as Namespace[];

type NsMessages<N extends Namespace> = (typeof CATALOGS)[N][Locale];

/** Server-side: return the typed namespace object for `locale` (RO fallback). */
export function getMessages<N extends Namespace>(
  locale: string,
  ns: N,
): NsMessages<N> {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return CATALOGS[ns][l];
}

/** Assemble a client-provider bundle for the given namespaces. */
export function buildBundle(
  locale: string,
  namespaces: Namespace[],
): Record<string, Record<string, unknown>> {
  const bundle: Record<string, Record<string, unknown>> = {};
  for (const ns of namespaces)
    bundle[ns] = getMessages(locale, ns) as unknown as Record<string, unknown>;
  return bundle;
}
