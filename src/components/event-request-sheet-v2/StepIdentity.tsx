"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { CuiLookupField } from "./CuiLookupField";
import { submitEventRequestDraft } from "@/app/api/event-requests/actions";
import { useT } from "@/lib/i18n/messages-provider";
import type { DraftState } from "./index";

interface Props {
  restaurantId: string;
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  onBack: () => void;
  onSent: () => void;
}

/**
 * Step 4 — identity. Collects guest contact info, optionally toggles a
 * "booking for a company" flow with live ANAF CUI lookup, and triggers the
 * server action that persists the draft + sends the OTP. On success the
 * parent advances to StepSent.
 */
export function StepIdentity({
  restaurantId,
  draft,
  onChange,
  onBack,
  onSent,
}: Props) {
  const t = useT("events");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!draft.occasion) {
      setError(t("sheetV2.stepIdentity.errorNoOccasion"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await submitEventRequestDraft({
          restaurantId,
          guestName: draft.guestName,
          guestEmail: draft.guestEmail,
          guestPhone: draft.guestPhone || undefined,
          occasion: draft.occasion!,
          eventDate: draft.eventDate,
          eventTimePreference: draft.eventTimePreference || undefined,
          partySize: draft.partySize,
          privateSpaceId: draft.privateSpaceId ?? undefined,
          spacePreference: draft.spacePreference || undefined,
          budgetPerHeadCents: draft.budgetPerHeadCents,
          menuPreference: draft.menuPreference || undefined,
          dietaryNotes: draft.dietaryNotes || undefined,
          additionalNotes: draft.additionalNotes || undefined,
          claimedCompanyCui:
            draft.bookingForCompany && draft.claimedCompanyCui
              ? draft.claimedCompanyCui
              : undefined,
          claimedCompanyName:
            draft.bookingForCompany && draft.claimedCompanyName
              ? draft.claimedCompanyName
              : undefined,
        });
        onSent();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheetV2.stepIdentity.heading")}
      </h2>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">{t("sheetV2.stepIdentity.nameLabel")}</span>
        <input
          value={draft.guestName}
          onChange={(e) => onChange({ guestName: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">{t("sheetV2.stepIdentity.emailLabel")}</span>
        <input
          type="email"
          value={draft.guestEmail}
          onChange={(e) => onChange({ guestEmail: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("sheetV2.stepIdentity.phoneLabel")}
        </span>
        <input
          type="tel"
          value={draft.guestPhone}
          onChange={(e) => onChange({ guestPhone: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={draft.bookingForCompany}
          onChange={(e) => onChange({ bookingForCompany: e.target.checked })}
        />
        {t("sheetV2.stepIdentity.companyCheckLabel")}
      </label>
      {draft.bookingForCompany && (
        <CuiLookupField
          cui={draft.claimedCompanyCui}
          denumire={draft.claimedCompanyName}
          onChange={onChange}
        />
      )}
      <div className="text-xs text-text-secondary flex items-start gap-2 bg-surface-bg rounded-card p-3">
        <ShieldCheck className="w-4 h-4 mt-0.5 text-[color:var(--color-occasion-corporate)] shrink-0" />
        <span>
          {t("sheetV2.stepIdentity.confirmationNotice")}
        </span>
      </div>
      {error && (
        <p className="text-error text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="flex-1 border border-border rounded-card py-3 font-semibold text-text-primary hover:bg-surface-bg transition-colors"
        >
          {t("sheetV2.stepIdentity.back")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !draft.guestName || !draft.guestEmail}
          className="flex-1 bg-brand-primary text-surface-white rounded-card py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary-dark transition-colors"
        >
          {pending ? t("sheetV2.stepIdentity.submitPending") : t("sheetV2.stepIdentity.submitLabel")}
        </button>
      </div>
    </div>
  );
}
