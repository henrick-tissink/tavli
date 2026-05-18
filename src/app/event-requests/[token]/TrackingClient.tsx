"use client";

import { useTransition } from "react";
import { Calendar, Users } from "lucide-react";
import { StatusTimeline } from "@/components/tracking/StatusTimeline";
import { QuoteExpiryCountdown } from "@/components/tracking/QuoteExpiryCountdown";
import { PartnerIdentityBadge } from "@/components/tracking/PartnerIdentityBadge";
import { Button } from "@/components/button";
import {
  consumerAcceptQuote,
  consumerDeclineQuote,
  consumerCancelEventRequest,
} from "./actions";

interface Props {
  er: {
    id: string;
    status: string;
    occasion: string;
    eventDate: string;
    partySize: number;
    partnerResponse: string | null;
    quotedAmountCents: number | null;
    quoteExpiresAt: Date | null;
    declineReason: string | null;
  };
  restaurant: { name: string; heroPath: string | null };
  quoteLineItems: { label: string; amountCents: number }[];
  token: string;
}

const STATUS_HEADLINE: Record<string, string> = {
  new: "Cerere trimisă",
  viewing: "Restaurantul îți vede cererea",
  replied: "Ai primit un răspuns",
  quoted: "Ofertă primită",
  accepted: "Ofertă acceptată",
  declined: "Cerere refuzată",
  expired_quote: "Oferta a expirat",
  cancelled: "Cerere anulată",
  expired: "Cerere expirată",
  completed: "Eveniment finalizat",
};

export function TrackingClient({
  er,
  restaurant,
  quoteLineItems,
  token,
}: Props) {
  const [pending, startTransition] = useTransition();
  const reloadAfter = (p: Promise<unknown>) =>
    p.then(() => {
      if (typeof window !== "undefined") window.location.reload();
    });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Cerere #{er.id.slice(0, 8)}
        </p>
        <h1 className="font-display text-3xl font-bold mt-1">
          {STATUS_HEADLINE[er.status] ?? er.status}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" /> {er.eventDate}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" /> {er.partySize} pers.
          </span>
        </div>
      </header>
      <StatusTimeline status={er.status} />
      <PartnerIdentityBadge
        name={restaurant.name}
        heroPath={restaurant.heroPath}
        viewing={er.status === "viewing"}
      />
      {er.partnerResponse && (
        <section className="bg-surface-bg p-4 rounded-card">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Răspuns restaurant
          </p>
          <p className="mt-2 whitespace-pre-line">{er.partnerResponse}</p>
        </section>
      )}
      {er.status === "quoted" && er.quotedAmountCents != null && (
        <section className="border border-brand-primary rounded-card p-4 space-y-3 bg-surface-white shadow-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-secondary">
              Ofertă totală
            </span>
            <span className="font-display text-3xl font-bold text-brand-primary">
              {(er.quotedAmountCents / 100).toLocaleString("ro-RO")} lei
            </span>
          </div>
          {quoteLineItems.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {quoteLineItems.map((l, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span className="text-text-secondary">{l.label}</span>
                  <span className="tabular-nums">
                    {(l.amountCents / 100).toLocaleString("ro-RO")} lei
                  </span>
                </li>
              ))}
            </ul>
          )}
          {er.quoteExpiresAt && (
            <p className="text-xs">
              <QuoteExpiryCountdown expiresAt={er.quoteExpiresAt} />
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  reloadAfter(consumerAcceptQuote(token)),
                )
              }
            >
              Acceptă oferta
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  reloadAfter(consumerDeclineQuote({ token })),
                )
              }
            >
              Refuză politicos
            </Button>
          </div>
        </section>
      )}
      {er.declineReason && er.status === "declined" && (
        <p className="text-sm text-text-secondary">Motiv: {er.declineReason}</p>
      )}
      {["new", "viewing", "replied", "quoted"].includes(er.status) && (
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              reloadAfter(consumerCancelEventRequest(token)),
            )
          }
        >
          Anulează cererea
        </Button>
      )}
    </main>
  );
}
