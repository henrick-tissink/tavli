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
}

export const PRICE_LABELS: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

/**
 * Display-format a list of cuisines. Empty arrays fall back to a generic
 * label so the UI doesn't render a stray middle-dot.
 */
export function formatCuisines(cuisines: string[]): string {
  if (!cuisines || cuisines.length === 0) return "Restaurant";
  return cuisines.join(" · ");
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

export interface RestaurantDetail extends Omit<Restaurant, "lat" | "lng"> {
  lat: number | null;
  lng: number | null;
  description: string;
  photos: string[];
  schedule: { days: string; hours: string }[];
  address: string;
  tags: string[];
  reviewIntelligence: ReviewIntelligence | null;
  reviews: Review[];
  nearby: Restaurant[];
  websiteUrl?: string;
  menuPdfUrl?: string;
}
