import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getReviewsForRestaurant } from "@/lib/repos/reviews-repo";
import { ReviewReportButton } from "./_components/ReviewReportButton";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-brand-primary" aria-label={`${rating} din 5 stele`}>
      <span aria-hidden>{"★".repeat(rating)}</span>
      <span aria-hidden className="text-border">
        {"★".repeat(5 - rating)}
      </span>
    </span>
  );
}

export default async function PartnerReviewsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);

  const reviews = restaurantId ? await getReviewsForRestaurant(restaurantId, 50) : [];
  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Reputație</p>
        <h1 className="mt-2 font-display text-4xl text-text-primary">Recenzii</h1>
        <p className="mt-3 text-sm text-text-secondary">
          {avg
            ? `${avg} ★ în medie din ${reviews.length} ${reviews.length === 1 ? "recenzie" : "recenzii"}.`
            : "Recenziile apar aici după ce oaspeții cu rezervare onorată le lasă."}
        </p>
      </header>

      <ul className="mt-8 space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-card border border-border bg-surface-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Stars rating={r.rating} />
                <span className="text-sm font-medium text-text-primary">{r.authorName}</span>
              </div>
              <span className="text-xs text-text-muted">{r.date}</span>
            </div>
            {r.text && <p className="mt-3 text-sm leading-relaxed text-text-secondary">{r.text}</p>}
            <div className="mt-3 flex justify-end">
              <ReviewReportButton reviewId={r.id} />
            </div>
          </li>
        ))}
        {reviews.length === 0 && (
          <li className="rounded-card border border-dashed border-border p-10 text-center text-sm text-text-muted">
            Nicio recenzie încă.
          </li>
        )}
      </ul>
    </div>
  );
}
