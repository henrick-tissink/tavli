"use client";

/**
 * Client island wiring the billing CTAs to their sheets + the Stripe portal
 * redirect. The page stays a server component; this owns only the open state.
 */
import { useState, useTransition } from "react";
import { CreditCard, ArrowLeftRight, XCircle } from "lucide-react";
import { toast } from "@/components/toast";
import { ChangePlanSheet } from "./ChangePlanSheet";
import { CancelSubscriptionSheet } from "./CancelSubscriptionSheet";
import { createBillingPortalSessionAction } from "../actions";

export function BillingActionsBar({
  organizationId,
  currentTier,
  currentFrequency,
  periodEndLabel,
  readOnly,
}: {
  organizationId: string;
  currentTier: "base" | "pro";
  currentFrequency: "monthly" | "annual";
  periodEndLabel: string | null;
  readOnly: boolean;
}) {
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [portalPending, startPortal] = useTransition();

  function openPortal() {
    startPortal(async () => {
      const res = await createBillingPortalSessionAction(organizationId);
      if (res.ok) {
        window.location.href = res.data.url;
      } else {
        toast.error("Portalul de plată nu e disponibil momentan.");
      }
    });
  }

  const base =
    "inline-flex min-h-[44px] items-center gap-2 rounded-button px-5 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={openPortal}
          disabled={portalPending}
          className={`${base} bg-brand-primary text-white shadow-card hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-60`}
        >
          <CreditCard size={16} aria-hidden /> Actualizează cardul
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setChangeOpen(true)}
            className={`${base} border border-border bg-surface-white text-text-primary hover:bg-surface-bg`}
          >
            <ArrowLeftRight size={16} aria-hidden /> Schimbă planul
          </button>
        )}
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className={`${base} text-text-secondary hover:text-error`}
        >
          <XCircle size={16} aria-hidden /> Anulează abonamentul
        </button>
      </div>

      <ChangePlanSheet
        organizationId={organizationId}
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        currentTier={currentTier}
        currentFrequency={currentFrequency}
        periodEndLabel={periodEndLabel}
      />
      <CancelSubscriptionSheet
        organizationId={organizationId}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        periodEndLabel={periodEndLabel}
      />
    </>
  );
}
