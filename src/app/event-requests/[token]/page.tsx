import { notFound } from "next/navigation";
import { getByTrackingToken } from "@/lib/repos/event-requests-repo";
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
    />
  );
}
