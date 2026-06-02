"use client";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { formatNumber } from "@/lib/i18n/format";

export function RevenueEstimateWidget({
  partySize,
  budgetPerHeadCents,
}: {
  partySize: number;
  budgetPerHeadCents: number | null;
}) {
  const t = useT("partner.corporate");
  const locale = useLocale();
  const lowCents = budgetPerHeadCents
    ? Math.round(budgetPerHeadCents * 0.85)
    : null;
  const highCents = budgetPerHeadCents
    ? Math.round(budgetPerHeadCents * 1.15)
    : null;
  const low =
    lowCents != null ? Math.round(lowCents / 100) * partySize : null;
  const high =
    highCents != null ? Math.round(highCents / 100) * partySize : null;
  return (
    <div className="rounded-card border border-border p-4 bg-gradient-to-br from-[color:var(--color-occasion-product-soft)] to-surface-white">
      <p className="text-xs font-semibold text-[color:var(--color-occasion-product)] uppercase tracking-wider">
        {t("revenue.title")}
      </p>
      {low != null && high != null ? (
        <p className="font-display text-2xl font-bold mt-1">
          {t("revenue.range", {
            low: formatNumber(low, locale),
            high: formatNumber(high, locale),
          })}
        </p>
      ) : (
        <p className="font-display text-lg mt-1 text-text-secondary">
          {t("revenue.noBudget")}
        </p>
      )}
      <p className="text-xs text-text-secondary mt-1">
        {t("revenue.footnote", { partySize })}
      </p>
    </div>
  );
}
