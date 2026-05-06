import "server-only";
import type { Review } from "@/lib/types";
import { supabaseAnon } from "@/lib/db/anon";

export function firstNameFrom(fullName: string): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "Anonymous";
  return trimmed.split(/\s+/)[0];
}

interface RawReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  first_name: string;
  created_at: string;
  party_size: number;
  reservation_date: string;
}

export function mapRowToReview(row: RawReviewRow): Review {
  return {
    id: row.id,
    authorName: row.first_name,
    rating: row.rating,
    date: row.created_at.slice(0, 10),
    reservationDate: row.reservation_date,
    guestCount: row.party_size,
    text: row.comment ?? "",
    // Phase 1: no helpful_count column; UI button is decorative until Phase 2.
    helpfulCount: 0,
  };
}

export async function getReviewsForRestaurant(
  restaurantId: string,
  limit = 20,
): Promise<Review[]> {
  const sb = supabaseAnon();
  if (!sb) return [];
  const { data } = await sb
    .from("reviews")
    .select(
      "id, rating, comment, first_name, created_at, party_size, reservation_date",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => mapRowToReview(r as RawReviewRow));
}
