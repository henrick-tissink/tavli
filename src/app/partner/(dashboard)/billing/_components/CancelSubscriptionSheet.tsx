"use client";

/**
 * §12 §10 — cancellation flow. One screen, optional reason + feedback, two
 * choices: pause at period end (recommended) or cancel immediately. No
 * retention call, no ticket — the six-promises contract ("cancellation is one
 * click in the product").
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { cancelSubscriptionAction } from "../actions";

const REASONS = [
  { value: "too_expensive", label: "Prea scump" },
  { value: "missing_feature", label: "Lipsește o funcție de care am nevoie" },
  { value: "business_closing", label: "Închidem / pauză de business" },
  { value: "switching_provider", label: "Trec la alt furnizor" },
  { value: "temporary_pause", label: "Pauză temporară" },
  { value: "other", label: "Alt motiv" },
];

export function CancelSubscriptionSheet({
  organizationId,
  open,
  onClose,
  periodEndLabel,
}: {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  periodEndLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");

  function submit(mode: "period_end" | "immediate") {
    startTransition(async () => {
      const res = await cancelSubscriptionAction(organizationId, mode, reason || undefined, feedback || undefined);
      if (res.ok) {
        toast.success(
          mode === "period_end"
            ? "Abonamentul se va încheia la finalul perioadei. Ai acces complet până atunci."
            : res.data.refundCents > 0
              ? `Abonament anulat. Îți rambursăm €${(res.data.refundCents / 100).toFixed(2)} pro-rata.`
              : "Abonament anulat.",
        );
        onClose();
        router.refresh();
      } else {
        toast.error("Anularea nu a reușit. Încearcă din nou.");
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Anulează abonamentul">
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-text-secondary">
          Anularea e un singur clic — fără tichet, fără apel de retenție. Îți predăm un export complet al
          datelor tale.
        </p>

        <div>
          <label className="block text-sm font-semibold text-text-primary" htmlFor="cancel-reason">
            De ce pleci? <span className="font-normal text-text-muted">(opțional)</span>
          </label>
          <select
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5 w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
          >
            <option value="">Alege un motiv…</option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary" htmlFor="cancel-feedback">
            Ceva ce am putea face mai bine? <span className="font-normal text-text-muted">(opțional)</span>
          </label>
          <textarea
            id="cancel-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            className="mt-1.5 w-full resize-none rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
          />
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("period_end")}
            className="flex w-full min-h-[48px] flex-col items-center justify-center rounded-button bg-text-primary px-6 py-3 text-sm font-bold text-surface-white transition-all hover:bg-text-primary/90 active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            Oprește facturarea la finalul perioadei
            {periodEndLabel && (
              <span className="mt-0.5 text-xs font-normal text-surface-white/70">
                Acces complet până la {periodEndLabel}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("immediate")}
            className="w-full min-h-[44px] rounded-button border border-error/40 px-6 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
          >
            Anulează imediat
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
