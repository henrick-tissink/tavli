"use client";

import { useTransition } from "react";
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
  token: string;
}

const STATUS_COPY_RO: Record<string, string> = {
  new: "Cerere trimisă, așteptăm restaurantul",
  viewing: "Restaurantul a deschis cererea",
  replied: "Restaurantul a răspuns",
  quoted: "Ai primit o ofertă",
  accepted: "Ofertă acceptată",
  declined: "Cererea a fost refuzată",
  expired_quote: "Oferta a expirat",
  cancelled: "Cerere anulată",
  expired: "Cerere expirată (fără răspuns)",
  completed: "Eveniment finalizat",
};

export function TrackingClient({ er, token }: Props) {
  const [pending, startTransition] = useTransition();

  function reloadAfter(promise: Promise<unknown>) {
    return promise.then(() => {
      if (typeof window !== "undefined") window.location.reload();
    });
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">
        {STATUS_COPY_RO[er.status] ?? er.status}
      </h1>
      <p className="text-sm text-zinc-500 mt-1">
        Cerere pentru {er.eventDate}, {er.partySize} persoane
      </p>

      {er.partnerResponse && (
        <section className="mt-4 bg-zinc-50 p-4 rounded">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Răspuns restaurant
          </p>
          <p className="mt-1 whitespace-pre-line">{er.partnerResponse}</p>
        </section>
      )}

      {er.status === "quoted" && er.quotedAmountCents != null && (
        <section className="mt-4">
          <p className="text-xl">
            <strong>{(er.quotedAmountCents / 100).toFixed(2)} lei</strong>
          </p>
          {er.quoteExpiresAt && (
            <p className="text-xs text-zinc-500">
              Oferta expiră pe{" "}
              {new Date(er.quoteExpiresAt).toLocaleDateString("ro-RO")}
            </p>
          )}
          <div className="flex gap-3 mt-3">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  reloadAfter(consumerAcceptQuote(token)),
                )
              }
            >
              Acceptă
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
              Refuză
            </Button>
          </div>
        </section>
      )}

      {er.declineReason && er.status === "declined" && (
        <p className="mt-4 text-sm">Motiv: {er.declineReason}</p>
      )}

      {["new", "viewing", "replied", "quoted"].includes(er.status) && (
        <Button
          variant="ghost"
          className="mt-6"
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
