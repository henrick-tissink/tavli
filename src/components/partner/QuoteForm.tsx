"use client";
import { useState, useMemo, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/button";
import { QuoteLineItemRow } from "./QuoteLineItemRow";
import { sendQuoteForEventRequest } from "@/app/api/event-requests/actions";

interface Line {
  id: string;
  label: string;
  amount: string;
}

const STARTING_TEMPLATES = (
  partySize: number,
  budgetPerHeadCents: number | null,
): Line[] => {
  const perHead = budgetPerHeadCents
    ? Math.round(budgetPerHeadCents / 100)
    : 300;
  return [
    {
      id: "1",
      label: `Meniu standard (${partySize} pers. × ${perHead} lei)`,
      amount: String(partySize * perHead),
    },
  ];
};

const SUGGESTED = [
  { label: "Welcome cocktail", per: 25 },
  { label: "Open bar (3h)", per: 90 },
  { label: "Tort personalizat", per: 18 },
  { label: "Decor floral", flat: 800 },
  { label: "DJ / sonorizare", flat: 1500 },
];

export function QuoteForm({
  eventRequestId,
  partySize,
  budgetPerHeadCents,
  onCancel,
}: {
  eventRequestId: string;
  partySize: number;
  budgetPerHeadCents: number | null;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<Line[]>(() =>
    STARTING_TEMPLATES(partySize, budgetPerHeadCents),
  );
  const [expiresDays, setExpiresDays] = useState(7);
  const [partnerResponse, setPartnerResponse] = useState("");
  const [pending, startTransition] = useTransition();
  const totalLei = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0),
    [lines],
  );

  function addLine(label = "", amount = "") {
    setLines((ls) => [
      ...ls,
      { id: String(Date.now() + Math.random()), label, amount },
    ]);
  }
  function addSuggested(s: { label: string; per?: number; flat?: number }) {
    const amount = s.flat ?? (s.per ? s.per * partySize : 0);
    addLine(s.label, String(amount));
  }
  function send() {
    startTransition(async () => {
      await sendQuoteForEventRequest({
        id: eventRequestId,
        expiresAt: new Date(
          Date.now() + expiresDays * 86_400_000,
        ).toISOString(),
        partnerResponse: partnerResponse || undefined,
        lineItems: lines
          .filter((l) => l.label.trim() && Number(l.amount) > 0)
          .map((l) => ({
            label: l.label,
            amountCents: Number(l.amount) * 100,
          })),
      });
      window.location.reload();
    });
  }

  return (
    <section className="space-y-4 rounded-card border border-border p-4 bg-surface-white">
      <h3 className="font-display text-lg font-bold">Construiește oferta</h3>
      <div className="space-y-2">
        {lines.map((l) => (
          <QuoteLineItemRow
            key={l.id}
            label={l.label}
            amount={l.amount}
            onChange={(p) =>
              setLines((ls) =>
                ls.map((ll) => (ll.id === l.id ? { ...ll, ...p } : ll)),
              )
            }
            onDelete={() =>
              setLines((ls) => ls.filter((ll) => ll.id !== l.id))
            }
          />
        ))}
        <button
          onClick={() => addLine()}
          className="text-sm font-medium text-brand-primary inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Adaugă linie
        </button>
      </div>
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
          Adăugări frecvente
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button
              key={s.label}
              onClick={() => addSuggested(s)}
              className="text-xs px-2 py-1 rounded-full bg-surface-bg hover:bg-border"
            >
              + {s.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={partnerResponse}
        onChange={(e) => setPartnerResponse(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Mesaj însoțitor pentru client (opțional)"
        className="w-full border border-border rounded-card p-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm">
        <span>Oferta expiră în</span>
        <input
          type="number"
          min={1}
          max={30}
          value={expiresDays}
          onChange={(e) => setExpiresDays(Number(e.target.value))}
          className="w-16 border border-border rounded-card p-1 tabular-nums"
        />
        <span>zile</span>
      </label>
      <div className="flex items-center justify-between p-3 bg-[color:var(--color-occasion-product-soft)] rounded-card">
        <span className="text-sm font-medium">
          Total: {totalLei.toLocaleString("ro-RO")} lei
        </span>
        <span className="text-xs text-text-secondary">
          {partySize} pers. ·{" "}
          {partySize > 0
            ? Math.round(totalLei / partySize).toLocaleString("ro-RO")
            : "—"}{" "}
          lei/pers
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Renunță
        </Button>
        <Button onClick={send} disabled={pending || totalLei === 0}>
          Trimite oferta
        </Button>
      </div>
    </section>
  );
}
