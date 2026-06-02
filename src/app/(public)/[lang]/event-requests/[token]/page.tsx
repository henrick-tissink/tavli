import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantPhotos, restaurants } from "@/lib/db/schema";
import { getByTrackingToken } from "@/lib/repos/event-requests-repo";
import { listLineItems } from "@/lib/repos/quote-line-items-repo";
import { TrackingClient } from "./TrackingClient";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { buildBundle } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/messages-provider";

export const dynamic = "force-dynamic";

export default async function EventRequestTrackingPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang: rawLang, token } = await params;
  const locale = isLocale(rawLang) ? rawLang : DEFAULT_LOCALE;
  const bundle = buildBundle(locale, ["ui", "common", "events"]);

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
    <MessagesProvider locale={locale} bundle={bundle}>
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
    </MessagesProvider>
  );
}
