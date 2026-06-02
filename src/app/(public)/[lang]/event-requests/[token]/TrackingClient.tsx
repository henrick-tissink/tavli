"use client";

import { useTransition } from "react";
import { Calendar, Users } from "lucide-react";
import { StatusTimeline } from "@/components/tracking/StatusTimeline";
import { QuoteExpiryCountdown } from "@/components/tracking/QuoteExpiryCountdown";
import { PartnerIdentityBadge } from "@/components/tracking/PartnerIdentityBadge";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
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

export function TrackingClient({
  er,
  restaurant,
  quoteLineItems,
  token,
}: Props) {
  const t = useT("events");
  const [pending, startTransition] = useTransition();
  const reloadAfter = (p: Promise<unknown>) =>
    p.then(() => {
      if (typeof window !== "undefined") window.location.reload();
    });

  const statusHeadline =
    t(`tracking.status.${er.status}`) || er.status;
  const requestLabel = t("tracking.requestLabel").replace(
    "{id}",
    er.id.slice(0, 8),
  );

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          {requestLabel}
        </p>
        <h1 className="font-display text-3xl font-bold mt-1">
          {statusHeadline}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" /> {er.eventDate}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" /> {er.partySize} {t("tracking.partySizeUnit")}
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
            {t("tracking.partnerResponseLabel")}
          </p>
          <p className="mt-2 whitespace-pre-line">{er.partnerResponse}</p>
        </section>
      )}
      {er.status === "quoted" && er.quotedAmountCents != null && (
        <section className="border border-brand-primary rounded-card p-4 space-y-3 bg-surface-white shadow-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-secondary">
              {t("tracking.quoteLabel")}
            </span>
            <span className="font-display text-3xl font-bold text-brand-primary">
              {(er.quotedAmountCents / 100).toLocaleString("ro-RO")} {t("tracking.quoteCurrency")}
            </span>
          </div>
          {quoteLineItems.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {quoteLineItems.map((l, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span className="text-text-secondary">{l.label}</span>
                  <span className="tabular-nums">
                    {(l.amountCents / 100).toLocaleString("ro-RO")} {t("tracking.quoteCurrency")}
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
              {t("tracking.acceptQuote")}
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
              {t("tracking.declineQuote")}
            </Button>
          </div>
        </section>
      )}
      {er.declineReason && er.status === "declined" && (
        <p className="text-sm text-text-secondary">
          {t("tracking.declineReasonPrefix")} {er.declineReason}
        </p>
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
          {t("tracking.cancelRequest")}
        </Button>
      )}
    </main>
  );
}
