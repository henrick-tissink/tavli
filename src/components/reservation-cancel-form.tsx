"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { cancelReservationByToken } from "@/app/(public)/[lang]/reservations/[token]/actions";
import { useT } from "@/lib/i18n/messages-provider";

export function ReservationCancelForm({
  token,
  restaurantName,
}: {
  token: string;
  restaurantName: string;
}) {
  const t = useT("booking");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(t("cancel.confirmDialog", { restaurantName }))) return;
    setError(null);
    start(async () => {
      const result = await cancelReservationByToken(token, reason);
      if (!result.ok) setError(result.error ?? t("cancel.errorGeneric"));
      else setDone(true);
    });
  };

  if (done) {
    return (
      <div className="rounded-card border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">
          {t("cancel.doneTitle")}
        </p>
        <p className="text-sm text-emerald-800 mt-1">
          {t("cancel.doneBody", { restaurantName })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="reason">
          {t("cancel.reasonLabel")}
        </label>
        <textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("cancel.reasonPlaceholder")}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        />
      </div>
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      <Button fullWidth disabled={pending} type="submit">
        {pending ? t("cancel.submitPending") : t("cancel.submitLabel", { restaurantName })}
      </Button>
    </form>
  );
}
