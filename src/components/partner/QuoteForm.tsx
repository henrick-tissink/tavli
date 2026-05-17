"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { sendQuoteForEventRequest } from "@/app/api/event-requests/actions";

export function QuoteForm({
  eventRequestId,
  onCancel,
}: {
  eventRequestId: string;
  onCancel: () => void;
}) {
  const [amountLei, setAmountLei] = useState<number>(0);
  const [daysValid, setDaysValid] = useState(7);
  const [partnerResponse, setPartnerResponse] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await sendQuoteForEventRequest({
            id: eventRequestId,
            // Task 21 will expose proper line-item composition in the UI; for
            // now we ship a single "Total" line so the action's required
            // shape stays satisfied without changing the form's surface.
            lineItems: [{ label: "Total", amountCents: amountLei * 100 }],
            expiresAt: new Date(
              Date.now() + daysValid * 86_400_000,
            ).toISOString(),
            partnerResponse: partnerResponse || undefined,
          });
          location.reload();
        });
      }}
    >
      <label className="block">
        <span className="text-sm">Sumă totală (lei)</span>
        <input
          type="number"
          min={1}
          value={amountLei}
          onChange={(e) => setAmountLei(Number(e.target.value))}
          className="w-full mt-1 border rounded p-2"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm">Valabilitate (zile)</span>
        <input
          type="number"
          min={1}
          max={30}
          value={daysValid}
          onChange={(e) => setDaysValid(Number(e.target.value))}
          className="w-full mt-1 border rounded p-2"
        />
      </label>
      <label className="block">
        <span className="text-sm">Mesaj însoțitor</span>
        <textarea
          value={partnerResponse}
          onChange={(e) => setPartnerResponse(e.target.value)}
          className="w-full mt-1 border rounded p-2"
          rows={3}
          maxLength={2000}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || amountLei <= 0}>
          Trimite oferta
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Anulează
        </Button>
      </div>
    </form>
  );
}
