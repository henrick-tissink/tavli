/**
 * Seeds 6 plausible reviews on the Atelier Floreasca showcase. Reviews
 * require a backing reservation per the schema (reviews.reservation_id
 * is NOT NULL UNIQUE), so we also seed 6 completed reservations.
 *
 * Idempotent: drops any existing seeded review/reservation set (matched
 * by guest_email pattern) and re-inserts cleanly. Re-runnable safely.
 *
 * Updates restaurants.rating + vote_count to reflect the seeded reviews.
 */
import { config } from "dotenv";
config({ path: ".env.prod" });
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SLUG = "atelier-floreasca";
const SEED_EMAIL_DOMAIN = "atelier-floreasca-seed.invalid";

interface ReviewSpec {
  firstName: string;
  partySize: number;
  daysAgo: number;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  zone?: string;
}

const REVIEWS: ReviewSpec[] = [
  {
    firstName: "Andrei",
    partySize: 2,
    daysAgo: 6,
    rating: 5,
    comment:
      "Atmosferă fantastică și meniu inspirat de sezon. Burrata cu sfeclă a fost descoperirea serii, iar Fetească Neagră de la Crama Bauer s-a potrivit perfect cu coasta de vită. Revenim sigur.",
  },
  {
    firstName: "Maria",
    partySize: 4,
    daysAgo: 13,
    rating: 5,
    comment:
      "Aniversarea celor 10 ani de căsătorie petrecută aici. Ne-au gestionat detaliile fără să ceară explicații. Tochitura cu Mangaliță — cea mai bună din București. Mulțumiri întregii echipe.",
  },
  {
    firstName: "Răzvan",
    partySize: 2,
    daysAgo: 19,
    rating: 5,
    comment:
      "Sarmalele casei sunt mai bune decât cele de duminică la mama, și nu spun asta ușor. Mămăligă cremoasă, smântână grasă, totul ca acasă cu un plus de tehnică. Mic, intim, bine făcut.",
  },
  {
    firstName: "Elena",
    partySize: 3,
    daysAgo: 26,
    rating: 5,
    comment:
      "Papanași — chef's kiss. Crème brûlée cu lavandă, espresso Origo. Finalul perfect al unei seri perfecte. Servire atentă, fără grabă.",
    zone: "Floreasca",
  },
  {
    firstName: "Cristian",
    partySize: 2,
    daysAgo: 34,
    rating: 5,
    comment:
      "Lista de vinuri naturale e mică dar bine aleasă, iar somelierul a știut exact ce să recomande. File de biban-de-mare gătit impecabil. Locul are suflet.",
  },
  {
    firstName: "Diana",
    partySize: 6,
    daysAgo: 42,
    rating: 4,
    comment:
      "Mâncarea — fără cusur, mai ales risotto cu hribi. Singurul minus a fost servirea într-o sâmbătă plină — am așteptat ceva pentru desert. Per total, locul merită vizitat și mă întorc.",
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id")
    .eq("slug", SLUG)
    .maybeSingle();
  if (!restaurant) throw new Error(`restaurant not found: ${SLUG}`);

  // Idempotent: drop existing seeded reservations (which cascades reviews
  // via reviews.reservation_id ON DELETE CASCADE).
  const { error: delErr } = await admin
    .from("reservations")
    .delete()
    .eq("restaurant_id", restaurant.id)
    .like("guest_email", `%@${SEED_EMAIL_DOMAIN}`);
  if (delErr) throw delErr;

  console.log(`seeding ${REVIEWS.length} reservations + reviews…`);
  let totalRating = 0;
  for (const r of REVIEWS) {
    const reservationDate = new Date();
    reservationDate.setDate(reservationDate.getDate() - r.daysAgo);
    const dateStr = reservationDate.toISOString().slice(0, 10);

    const { data: reservation, error: rErr } = await admin
      .from("reservations")
      .insert({
        restaurant_id: restaurant.id,
        guest_name: `${r.firstName} (seed)`,
        guest_phone: "0700000000",
        guest_email: `${r.firstName.toLowerCase()}@${SEED_EMAIL_DOMAIN}`,
        party_size: r.partySize,
        reservation_date: dateStr,
        reservation_time: "20:00:00",
        zone: r.zone ?? null,
        status: "completed",
        confirmation_token: crypto.randomBytes(32).toString("hex"),
      })
      .select("id")
      .single();
    if (rErr || !reservation) throw rErr ?? new Error("reservation insert returned nothing");

    const { error: revErr } = await admin.from("reviews").insert({
      reservation_id: reservation.id,
      restaurant_id: restaurant.id,
      rating: r.rating,
      comment: r.comment,
      first_name: r.firstName,
      party_size: r.partySize,
      reservation_date: dateStr,
    });
    if (revErr) throw revErr;

    totalRating += r.rating;
    console.log(`  · ${r.firstName} (${r.rating}★, ${r.daysAgo} days ago) ✓`);
  }

  // Update denormalized rating + vote_count
  const avg = totalRating / REVIEWS.length;
  const { error: updErr } = await admin
    .from("restaurants")
    .update({
      rating: Math.round(avg * 10) / 10,
      vote_count: REVIEWS.length,
    })
    .eq("id", restaurant.id);
  if (updErr) throw updErr;

  console.log(`\n✓ rating updated → ${(Math.round(avg * 10) / 10).toFixed(1)}★ (${REVIEWS.length} reviews)`);
}

main().catch((err) => {
  console.error("seed-showcase-reviews failed:", err);
  process.exit(1);
});
