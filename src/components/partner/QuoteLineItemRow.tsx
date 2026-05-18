"use client";
import { X } from "lucide-react";

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
  return (
    <div className="flex items-center gap-2">
      <input
        placeholder="Descriere"
        value={label}
        onChange={(e) => onChange({ label: e.target.value })}
        className="flex-1 border border-border rounded-card p-2"
      />
      <input
        type="number"
        placeholder="Suma (lei)"
        value={amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        className="w-32 border border-border rounded-card p-2 tabular-nums"
      />
      <button
        onClick={onDelete}
        aria-label="Șterge linie"
        className="text-text-muted hover:text-error"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
