"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { cancelReservationByToken } from "@/app/reservations/[token]/actions";

export function ReservationCancelForm({
  token,
  restaurantName,
}: {
  token: string;
  restaurantName: string;
}) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Cancel your reservation at ${restaurantName}?`)) return;
    setError(null);
    start(async () => {
      const result = await cancelReservationByToken(token, reason);
      if (!result.ok) setError(result.error ?? "Could not cancel.");
      else setDone(true);
    });
  };

  if (done) {
    return (
      <div className="rounded-card border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">
          Reservation cancelled.
        </p>
        <p className="text-sm text-emerald-800 mt-1">
          We&apos;ve let {restaurantName} know. You can close this tab.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="reason">
          Reason (optional)
        </label>
        <textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Plans changed, running late, couldn't make it…"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        />
      </div>
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      <Button fullWidth disabled={pending} type="submit">
        {pending ? "Cancelling…" : `Cancel reservation at ${restaurantName}`}
      </Button>
    </form>
  );
}
