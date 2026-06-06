export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  cuisines: string[];
  priceLevel: 1 | 2 | 3 | 4;
  zone: string;
  city: string;
  rating: number;
  voteCount: number;
  photoUrl: string | null;
  photoCount: number;
  status: "open" | "closed";
  closesAt?: string;
  opensAt?: string;
  availableSlots: string[];
  reviewSnippet?: string;
  topDimensionLabel?: string;
  topDimensionPercent?: number;
  distance?: string;
  lat?: number;
  lng?: number;
  /**
   * Per-venue accepted event occasions. Populated only for events-capability
   * listings (the events landing filter). Absent or empty ⇒ the venue accepts
   * all occasions.
   */
  acceptedOccasions?: EventOccasion[];
  privateSpaces?: {
    id: string;
    name: string;
    description: string | null;
    capacityMin: number;
    capacityMax: number;
    photoStoragePath: string | null;
  }[];
}

import { type Locale, DEFAULT_LOCALE } from "@/lib/i18n/locale";

export const PRICE_LABELS: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

// Display labels for cuisines. Stored values stay in English (a stable
// canonical key); the UI maps to a per-locale label for display. Unknown
// keys fall through unchanged so partner-entered free-form values still
// render. The `ro` column is the regression oracle and must stay
// byte-identical to the historical Romanian labels.
export const CUISINE_LABELS: Record<Locale, Record<string, string>> = {
  ro: {
    Romanian: "Românească",
    Italian: "Italiană",
    Japanese: "Japoneză",
    Turkish: "Turcească",
    French: "Franțuzească",
    Chinese: "Chinezească",
    Lebanese: "Libaneză",
    Spanish: "Spaniolă",
    Greek: "Grecească",
    Thai: "Thailandeză",
    Indian: "Indiană",
    Mexican: "Mexicană",
    Korean: "Coreeană",
    Balkan: "Balcanică",
    American: "Americană",
    European: "Europeană",
    Mediterranean: "Mediteraneană",
    Fusion: "Fusion",
    Brunch: "Brunch",
    Coffee: "Cafenea",
    Cocktails: "Cocktail bar",
    Pizza: "Pizzerie",
    Burger: "Burger",
    Vegan: "Vegană",
    Vegetarian: "Vegetariană",
    Other: "Alta",
  },
  en: {
    Romanian: "Romanian",
    Italian: "Italian",
    Japanese: "Japanese",
    Turkish: "Turkish",
    French: "French",
    Chinese: "Chinese",
    Lebanese: "Lebanese",
    Spanish: "Spanish",
    Greek: "Greek",
    Thai: "Thai",
    Indian: "Indian",
    Mexican: "Mexican",
    Korean: "Korean",
    Balkan: "Balkan",
    American: "American",
    European: "European",
    Mediterranean: "Mediterranean",
    Fusion: "Fusion",
    Brunch: "Brunch",
    Coffee: "Café",
    Cocktails: "Cocktail bar",
    Pizza: "Pizzeria",
    Burger: "Burger",
    Vegan: "Vegan",
    Vegetarian: "Vegetarian",
    Other: "Other",
  },
  de: {
    Romanian: "Rumänisch",
    Italian: "Italienisch",
    Japanese: "Japanisch",
    Turkish: "Türkisch",
    French: "Französisch",
    Chinese: "Chinesisch",
    Lebanese: "Libanesisch",
    Spanish: "Spanisch",
    Greek: "Griechisch",
    Thai: "Thailändisch",
    Indian: "Indisch",
    Mexican: "Mexikanisch",
    Korean: "Koreanisch",
    Balkan: "Balkanisch",
    American: "Amerikanisch",
    European: "Europäisch",
    Mediterranean: "Mediterran",
    Fusion: "Fusion",
    Brunch: "Brunch",
    Coffee: "Café",
    Cocktails: "Cocktailbar",
    Pizza: "Pizzeria",
    Burger: "Burger",
    Vegan: "Vegan",
    Vegetarian: "Vegetarisch",
    Other: "Sonstige",
  },
};

export function cuisineLabel(value: string, locale: Locale = DEFAULT_LOCALE): string {
  return CUISINE_LABELS[locale]?.[value] ?? value;
}

/**
 * Display-format a list of cuisines. Empty arrays fall back to a generic
 * label so the UI doesn't render a stray middle-dot.
 */
export function formatCuisines(cuisines: string[], locale: Locale = DEFAULT_LOCALE): string {
  if (!cuisines || cuisines.length === 0) return "Restaurant";
  return cuisines.map((c) => cuisineLabel(c, locale)).join(" · ");
}

// Display labels for booking/seating zones. Zones are free-text DB data
// seeded in Romanian; this maps the common seeded values to en/de. Unknown
// values (custom partner zone names) pass through unchanged, and the `ro`
// locale always returns the original Romanian string.
const ZONE_LABELS: Record<string, { en: string; de: string }> = {
  Terasă: { en: "Terrace", de: "Terrasse" },
  Interior: { en: "Indoor", de: "Innenbereich" },
  Grădină: { en: "Garden", de: "Garten" },
  Bar: { en: "Bar", de: "Bar" },
  Salon: { en: "Lounge", de: "Salon" },
};

export function zoneLabel(zone: string, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === "ro") return zone;
  const entry = ZONE_LABELS[zone];
  if (!entry) return zone;
  return locale === "de" ? entry.de : entry.en;
}

export interface Review {
  id: string;
  authorName: string;
  rating: number;
  date: string;
  reservationDate: string;
  guestCount: number;
  text: string;
  helpfulCount: number;
  restaurantReply?: {
    text: string;
    authorName: string;
    authorTitle: string;
    date: string;
  };
}

export interface ReviewIntelligence {
  dimensions: {
    label: string;
    icon: string;
    percent: number;
    mentionCount: number;
  }[];
  topMentions: { phrase: string; count: number }[];
  bestFor: string[];
}

export type MenuDietaryTag =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "spicy"
  | "chef-pick"
  | "popular";

export interface MenuItem {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  price: number;
  photoUrl?: string;
  tags?: MenuDietaryTag[];
}

export interface MenuSection {
  id: string;
  name: string;
  intro?: string;
}

export interface Menu {
  restaurantId: string;
  currency: "lei" | "TRY" | "EUR";
  sections: MenuSection[];
  items: MenuItem[];
  heroNote?: string;
}

export type EventOccasion =
  | "wedding"
  | "birthday"
  | "corporate_dinner"
  | "product_launch"
  | "other";

export interface RestaurantDetail extends Omit<Restaurant, "lat" | "lng"> {
  lat: number | null;
  lng: number | null;
  description: string;
  heroNote?: string;
  photos: string[];
  schedule: { days: string; hours: string }[];
  address: string;
  tags: string[];
  reviewIntelligence: ReviewIntelligence | null;
  reviews: Review[];
  nearby: Restaurant[];
  chefPicks: MenuItem[];
  websiteUrl?: string;
  menuPdfUrl?: string;
  eventsIntakeEnabled: boolean;
  acceptedOccasions: EventOccasion[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
  /**
   * Largest party the floor plan can seat online — the sum of the largest
   * combinable tables (top 3 bookable tables by capacity). Drives the party
   * stepper's upper bound so 13–22 covers can book via table combinations
   * instead of being pushed to the private-events flow. `null` when the venue
   * has no bookable floor plan (falls back to the coarse default cap).
   */
  maxOnlinePartySize?: number | null;
}
