"use client";

/**
 * §12 §8 — change plan. Tier swap (Base ↔ Pro) applies immediately; frequency
 * change is deferred to period-end (no immediate charge), per §8.2/§8.3.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import { changeTierAction, requestFrequencyChangeAction } from "../actions";

type Tier = "base" | "pro";
type Frequency = "monthly" | "annual";

export function ChangePlanSheet({
  organizationId,
  open,
  onClose,
  currentTier,
  currentFrequency,
  periodEndLabel,
}: {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
  currentFrequency: Frequency;
  periodEndLabel: string | null;
}) {
  const t = useT("partner.billing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function swapTier(target: Tier) {
    startTransition(async () => {
      const res = await changeTierAction(organizationId, target);
      if (res.ok) {
        toast.success(target === "pro" ? t("changePlan.toastSwitchedPro") : t("changePlan.toastSwitchedBase"));
        onClose();
        router.refresh();
      } else if (res.code === "TV1005") {
        toast.error(t("changePlan.toastTierLimit"));
      } else {
        toast.error(t("changePlan.toastTierFailed"));
      }
    });
  }

  function switchFrequency(target: Frequency) {
    startTransition(async () => {
      const res = await requestFrequencyChangeAction(organizationId, target);
      if (res.ok) {
        toast.success(
          periodEndLabel
            ? t("changePlan.toastFrequencyApplied", { date: periodEndLabel })
            : t("changePlan.toastFrequencyAppliedEnd"),
        );
        onClose();
        router.refresh();
      } else {
        toast.error(t("changePlan.toastFrequencyFailed"));
      }
    });
  }

  const otherTier: Tier = currentTier === "pro" ? "base" : "pro";
  const otherFrequency: Frequency = currentFrequency === "annual" ? "monthly" : "annual";

  return (
    <BottomSheet open={open} onClose={onClose} title={t("changePlan.title")}>
      <div className="space-y-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("changePlan.tierHeading")}</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {t("changePlan.tierBodyPrefix")}<span className="font-semibold text-text-primary">{currentTier === "pro" ? t("changePlan.tierCurrentPro") : t("changePlan.tierCurrentBase")}</span>{t("changePlan.tierBodySuffix")}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => swapTier(otherTier)}
            className="mt-3 w-full min-h-[48px] rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {otherTier === "pro" ? t("changePlan.switchToPro") : t("changePlan.switchToBase")}
          </button>
        </section>

        <section className="border-t border-border pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("changePlan.frequencyHeading")}</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {t("changePlan.frequencyBodyPrefix")}<span className="font-semibold text-text-primary">{currentFrequency === "annual" ? t("changePlan.frequencyCurrentAnnual") : t("changePlan.frequencyCurrentMonthly")}</span>{t("changePlan.frequencyBodySuffix", { periodEnd: periodEndLabel ? ` (${periodEndLabel})` : "" })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => switchFrequency(otherFrequency)}
            className="mt-3 w-full min-h-[48px] rounded-button border border-border bg-surface-white px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {otherFrequency === "annual" ? t("changePlan.switchToAnnual") : t("changePlan.switchToMonthly")}
          </button>
        </section>
      </div>
    </BottomSheet>
  );
}
