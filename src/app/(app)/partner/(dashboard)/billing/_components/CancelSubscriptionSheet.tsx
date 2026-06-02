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
import { useT } from "@/lib/i18n/messages-provider";
import { cancelSubscriptionAction } from "../actions";

const REASON_VALUES = [
  "too_expensive",
  "missing_feature",
  "business_closing",
  "switching_provider",
  "temporary_pause",
  "other",
] as const;

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
  const t = useT("partner.billing");
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
            ? t("cancel.toastPeriodEnd")
            : res.data.refundCents > 0
              ? t("cancel.toastRefund", { amount: (res.data.refundCents / 100).toFixed(2) })
              : t("cancel.toastCancelled"),
        );
        onClose();
        router.refresh();
      } else {
        toast.error(t("cancel.toastFailed"));
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("cancel.title")}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("cancel.intro")}
        </p>

        <div>
          <label className="block text-sm font-semibold text-text-primary" htmlFor="cancel-reason">
            {t("cancel.reasonLabel")} <span className="font-normal text-text-muted">{t("cancel.optional")}</span>
          </label>
          <select
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5 w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
          >
            <option value="">{t("cancel.reasonPlaceholder")}</option>
            {REASON_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`cancel.reasons.${value}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary" htmlFor="cancel-feedback">
            {t("cancel.feedbackLabel")} <span className="font-normal text-text-muted">{t("cancel.optional")}</span>
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
            {t("cancel.submitPeriodEnd")}
            {periodEndLabel && (
              <span className="mt-0.5 text-xs font-normal text-surface-white/70">
                {t("cancel.accessUntil", { date: periodEndLabel })}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("immediate")}
            className="w-full min-h-[44px] rounded-button border border-error/40 px-6 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
          >
            {t("cancel.submitImmediate")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
