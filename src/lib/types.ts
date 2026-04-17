export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
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

export interface RestaurantDetail extends Omit<Restaurant, "lat" | "lng"> {
  lat: number;
  lng: number;
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
