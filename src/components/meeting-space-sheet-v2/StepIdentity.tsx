"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import { minuteToTime } from "@/lib/meeting-spaces/slots";
import { submitMeetingBookingRequest } from "@/app/api/meeting-bookings/actions";
import type { MeetingDraft, MeetingSpaceTile } from "./types";

const inputCls =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

interface Props {
  restaurantId: string;
  space: MeetingSpaceTile;
  draft: MeetingDraft;
  onChange: (patch: Partial<MeetingDraft>) => void;
  onBack: () => void;
  onSent: () => void;
}

export function StepIdentity({ restaurantId, space, draft, onChange, onBack, onSent }: Props) {
  const t = useT("meetingSpaces");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!draft.guestName.trim() || !/.+@.+\..+/.test(draft.guestEmail)) {
      setError(t("stepIdentity.errorRequired"));
      return;
    }
    if (draft.partySize > space.capacity) {
      setError(t("stepIdentity.errorPartyTooBig", { capacity: String(space.capacity) }));
      return;
    }
    if (draft.startMinute === null || draft.durationMinutes === null) {
      setError(t("stepIdentity.errorGeneric"));
      return;
    }
    const startMinute = draft.startMinute;
    const durationMinutes = draft.durationMinutes;
    start(async () => {
      const res = await submitMeetingBookingRequest({
        restaurantId,
        meetingSpaceId: space.id,
        bookingDate: draft.bookingDate,
        startTime: minuteToTime(startMinute),
        durationMinutes,
        partySize: draft.partySize,
        guestName: draft.guestName.trim(),
        guestEmail: draft.guestEmail.trim(),
        guestPhone: draft.guestPhone.trim() || undefined,
        company: draft.company.trim() || undefined,
        notes: draft.notes.trim() || undefined,
      });
      if (res.ok) {
        onSent();
        return;
      }
      if (res.error === "slot_taken") setError(t("stepIdentity.errorSlotTaken"));
      else if (res.error === "party_too_big")
        setError(t("stepIdentity.errorPartyTooBig", { capacity: String(space.capacity) }));
      else setError(t("stepIdentity.errorGeneric"));
    });
  };

  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepIdentity.title")}
      </h3>

      {error && (
        <p
          className="mt-3 text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.nameLabel")}
          </span>
          <input
            type="text"
            value={draft.guestName}
            onChange={(e) => onChange({ guestName: e.target.value })}
            maxLength={120}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.emailLabel")}
          </span>
          <input
            type="email"
            value={draft.guestEmail}
            onChange={(e) => onChange({ guestEmail: e.target.value })}
            maxLength={255}
            required
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-text-primary">
              {t("stepIdentity.phoneLabel")}{" "}
              <span className="text-text-muted">{t("stepIdentity.phoneOptional")}</span>
            </span>
            <input
              type="tel"
              value={draft.guestPhone}
              onChange={(e) => onChange({ guestPhone: e.target.value })}
              maxLength={32}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-primary">
              {t("stepIdentity.partyLabel")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={space.capacity}
              value={draft.partySize}
              onChange={(e) => onChange({ partySize: parseInt(e.target.value, 10) || 1 })}
              className={inputCls}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.companyLabel")}{" "}
            <span className="text-text-muted">{t("stepIdentity.companyOptional")}</span>
          </span>
          <input
            type="text"
            value={draft.company}
            onChange={(e) => onChange({ company: e.target.value })}
            maxLength={160}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.notesLabel")}{" "}
            <span className="text-text-muted">{t("stepIdentity.notesOptional")}</span>
          </span>
          <textarea
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            maxLength={1000}
            rows={3}
            placeholder={t("stepIdentity.notesPlaceholder")}
            className={`${inputCls} resize-y`}
          />
        </label>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          {t("sheet.back")}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? t("stepIdentity.submitting") : t("stepIdentity.submit")}
        </Button>
      </div>
    </div>
  );
}
