"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { declineEventRequest } from "@/app/api/event-requests/actions";

const REASON_KEYS = [
  "no_availability",
  "budget_too_low",
  "space_too_small",
  "other",
] as const;

export function DeclineForm({
  eventRequestId,
  onCancel,
}: {
  eventRequestId: string;
  onCancel: () => void;
}) {
  const t = useT("partner.corporate");
  const [reason, setReason] = useState<string>(REASON_KEYS[0]);
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
        {REASON_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="radio"
              name="reason"
              value={key}
              checked={reason === key}
              onChange={(e) => setReason(e.target.value)}
            />
            {t(`decline.reasons.${key}`)}
          </label>
        ))}
      </fieldset>
      <textarea
        value={free}
        onChange={(e) => setFree(e.target.value)}
        className="w-full border rounded p-2"
        rows={2}
        placeholder={t("decline.detailsPlaceholder")}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t("decline.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("decline.back")}
        </Button>
      </div>
    </form>
  );
}
