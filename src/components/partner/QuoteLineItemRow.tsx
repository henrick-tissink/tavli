"use client";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

export function QuoteLineItemRow({
  label,
  amount,
  onChange,
  onDelete,
}: {
  label: string;
  amount: string;
  onChange: (patch: { label?: string; amount?: string }) => void;
  onDelete: () => void;
}) {
  const t = useT("partner.corporate");
  return (
    <div className="flex items-center gap-2">
      <input
        placeholder={t("quote.lineDescriptionPlaceholder")}
        value={label}
        onChange={(e) => onChange({ label: e.target.value })}
        className="flex-1 border border-border rounded-card p-2"
      />
      <input
        type="number"
        placeholder={t("quote.lineAmountPlaceholder")}
        value={amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        className="w-32 border border-border rounded-card p-2 tabular-nums"
      />
      <button
        onClick={onDelete}
        aria-label={t("quote.deleteLine")}
        className="text-text-muted hover:text-error"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
