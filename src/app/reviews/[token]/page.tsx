import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ReviewSubmitForm } from "@/components/review-submit-form";

export const dynamic = "force-dynamic";

type Loaded =
  | {
      kind: "ready";
      restaurantName: string;
      guestName: string;
      reservationDate: string;
    }
  | { kind: "already_reviewed" }
  | { kind: "ineligible" }
  | { kind: "not_found" }
  | { kind: "config_missing" };

async function loadContext(token: string): Promise<Loaded> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { kind: "config_missing" };
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("reservations")
    .select(
      "id, status, guest_name, reservation_date, restaurants(name), reviews(id)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) return { kind: "not_found" };
  if (data.status === "cancelled" || data.status === "no_show")
    return { kind: "ineligible" };

  const review = Array.isArray(data.reviews) ? data.reviews[0] : data.reviews;
  if (review?.id) return { kind: "already_reviewed" };

  const restaurantField = data.restaurants as
    | { name: string }
    | { name: string }[]
    | null;
  const restaurantName = Array.isArray(restaurantField)
    ? restaurantField[0]?.name ?? "the restaurant"
    : restaurantField?.name ?? "the restaurant";

  return {
    kind: "ready",
    restaurantName,
    guestName: data.guest_name,
    reservationDate: data.reservation_date,
  };
}

function parseRating(v: string | string[] | undefined): number {
  if (typeof v !== "string") return 0;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

export default async function ReviewSubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadContext(token);
  const initialRating = parseRating(sp.rating);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-8 shadow-card">
        <Link
          href="/"
          className="font-display text-2xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          Review
        </p>

        {ctx.kind === "ready" && (
          <>
            <h1 className="font-display text-[28px] font-bold text-text-primary leading-tight mt-6">
              How was {ctx.restaurantName}?
            </h1>
            <p className="text-sm text-text-secondary mt-2">
              Visited on{" "}
              {new Date(`${ctx.reservationDate}T12:00:00`).toLocaleDateString(
                "en-GB",
                { weekday: "long", day: "numeric", month: "long" },
              )}
              . Your review is anonymous — only your first name is shown.
            </p>
            <div className="mt-6">
              <ReviewSubmitForm token={token} initialRating={initialRating} />
            </div>
          </>
        )}
        {ctx.kind === "already_reviewed" && (
          <Blank
            title="Already reviewed"
            body="You've already left a review for this reservation. Thanks again!"
          />
        )}
        {ctx.kind === "ineligible" && (
          <Blank
            title="Can't review this one"
            body="This reservation was cancelled or marked as no-show, so it isn't eligible for a review."
          />
        )}
        {ctx.kind === "not_found" && (
          <Blank
            title="Link not recognised"
            body="This review link wasn't recognised. It may have been mistyped — try copying it from your email again."
          />
        )}
        {ctx.kind === "config_missing" && (
          <Blank
            title="Platform not configured"
            body="Tavli is still setting up. Please try again later or contact support."
          />
        )}
      </div>
    </div>
  );
}

function Blank({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="font-display text-[26px] font-bold text-text-primary leading-tight mt-6">
        {title}
      </h1>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{body}</p>
      <p className="text-xs text-text-muted mt-6">
        Contact:{" "}
        <a href="mailto:hello@tavli.ro" className="text-brand-primary">
          hello@tavli.ro
        </a>
      </p>
    </>
  );
}
