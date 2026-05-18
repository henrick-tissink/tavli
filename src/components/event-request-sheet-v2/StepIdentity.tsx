"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { CuiLookupField } from "./CuiLookupField";
import { submitEventRequestDraft } from "@/app/api/event-requests/actions";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!draft.occasion) {
      setError("Alege ocazia înainte de a trimite.");
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
        Cum te găsim?
      </h2>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">Nume</span>
        <input
          value={draft.guestName}
          onChange={(e) => onChange({ guestName: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">Email</span>
        <input
          type="email"
          value={draft.guestEmail}
          onChange={(e) => onChange({ guestEmail: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          Telefon (opțional)
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
        Rezervare pentru o companie (facturare cu CUI)
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
          Îți vom trimite un link de confirmare pe email. Restaurantul vede
          cererea ta doar după ce confirmi.
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
          Înapoi
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !draft.guestName || !draft.guestEmail}
          className="flex-1 bg-brand-primary text-surface-white rounded-card py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary-dark transition-colors"
        >
          {pending ? "Se trimite…" : "Trimite cererea"}
        </button>
      </div>
    </div>
  );
}
