"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { declineEventRequest } from "@/app/api/event-requests/actions";

const REASONS = [
  { value: "no_availability", label: "Indisponibilitate" },
  { value: "budget_too_low", label: "Buget insuficient" },
  { value: "space_too_small", label: "Spațiul nu se potrivește" },
  { value: "other", label: "Alt motiv" },
];

export function DeclineForm({
  eventRequestId,
  onCancel,
}: {
  eventRequestId: string;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [free, setFree] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await declineEventRequest({
            id: eventRequestId,
            reason: free ? `${reason}: ${free}` : reason,
          });
          location.reload();
        });
      }}
    >
      <fieldset className="space-y-2">
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="reason"
              value={r.value}
              checked={reason === r.value}
              onChange={(e) => setReason(e.target.value)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <textarea
        value={free}
        onChange={(e) => setFree(e.target.value)}
        className="w-full border rounded p-2"
        rows={2}
        placeholder="Detalii (opțional)"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Refuză
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Înapoi
        </Button>
      </div>
    </form>
  );
}
