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
}

export const PRICE_LABELS: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};
