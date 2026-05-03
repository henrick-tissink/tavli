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
  reservations:
    | { reservation_date: string; party_size: number }
    | { reservation_date: string; party_size: number }[]
    | null;
}

export function mapRowToReview(row: RawReviewRow): Review {
  const resv = Array.isArray(row.reservations)
    ? row.reservations[0]
    : row.reservations;
  return {
    id: row.id,
    authorName: row.first_name,
    rating: row.rating,
    date: row.created_at.slice(0, 10),
    reservationDate: resv?.reservation_date ?? row.created_at.slice(0, 10),
    guestCount: resv?.party_size ?? 0,
    text: row.comment ?? "",
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
      "id, rating, comment, first_name, created_at, reservations(reservation_date, party_size)",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => mapRowToReview(r as unknown as RawReviewRow));
}
