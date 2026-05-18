import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantPhotos, restaurants } from "@/lib/db/schema";
import { getByTrackingToken } from "@/lib/repos/event-requests-repo";
import { listLineItems } from "@/lib/repos/quote-line-items-repo";
import { TrackingClient } from "./TrackingClient";

export const dynamic = "force-dynamic";

export default async function EventRequestTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const er = await getByTrackingToken(token);
  if (!er) notFound();

  const [restaurantRow] = await dbAdmin
    .select({ name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.id, er.restaurantId))
    .limit(1);

  const [heroRow] = await dbAdmin
    .select({ storagePath: restaurantPhotos.storagePath })
    .from(restaurantPhotos)
    .where(
      and(
        eq(restaurantPhotos.restaurantId, er.restaurantId),
        eq(restaurantPhotos.kind, "hero"),
      ),
    )
    .orderBy(asc(restaurantPhotos.sortOrder))
    .limit(1);

  const lineItems = await listLineItems(er.id);

  return (
    <TrackingClient
      token={token}
      er={{
        id: er.id,
        status: er.status,
        occasion: er.occasion,
        eventDate: er.eventDate,
        partySize: er.partySize,
        partnerResponse: er.partnerResponse,
        quotedAmountCents: er.quotedAmountCents,
        quoteExpiresAt: er.quoteExpiresAt,
        declineReason: er.declineReason,
      }}
      restaurant={{
        name: restaurantRow?.name ?? "Restaurant",
        heroPath: heroRow?.storagePath ?? null,
      }}
      quoteLineItems={lineItems.map((l) => ({
        label: l.label,
        amountCents: l.amountCents,
      }))}
    />
  );
}
