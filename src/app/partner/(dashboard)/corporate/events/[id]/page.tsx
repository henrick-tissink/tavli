import { notFound } from "next/navigation";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, restaurantPrivateSpaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { findOverlappingReservations } from "@/lib/repos/event-requests-repo";
import { EventRequestDetail } from "@/components/partner/EventRequestDetail";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getPartnerRestaurant();
  const [er] = await dbAdmin
    .select()
    .from(eventRequests)
    .where(eq(eventRequests.id, id))
    .limit(1);
  if (!er || er.restaurantId !== r.id) notFound();
  let privateSpaceName: string | null = null;
  if (er.privateSpaceId) {
    const [ps] = await dbAdmin
      .select({ name: restaurantPrivateSpaces.name })
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.id, er.privateSpaceId))
      .limit(1);
    privateSpaceName = ps?.name ?? null;
  }
  const overlaps = await findOverlappingReservations(r.id, er.eventDate);
  return (
    <EventRequestDetail
      er={{
        id: er.id,
        status: er.status,
        occasion: er.occasion,
        eventDate: er.eventDate,
        partySize: er.partySize,
        guestName: er.guestName,
        guestEmail: er.guestEmail,
        guestPhone: er.guestPhone,
        spacePreference: er.spacePreference,
        budgetPerHeadCents: er.budgetPerHeadCents,
        menuPreference: er.menuPreference,
        dietaryNotes: er.dietaryNotes,
        additionalNotes: er.additionalNotes,
        partnerResponse: er.partnerResponse,
        quotedAmountCents: er.quotedAmountCents,
        privateSpaceName,
        claimedCompanyCui: er.claimedCompanyCui,
        claimedCompanyName: er.claimedCompanyName,
      }}
      overlaps={overlaps.map((o) => ({
        id: o.id,
        reservationTime: o.reservationTime,
        partySize: o.partySize,
      }))}
    />
  );
}
