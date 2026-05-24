"use client";

/**
 * Export modal — collects date range + included tables and calls
 * requestAnalyticsExport. On success it shows the "we'll email you" state
 * (§7.4) rather than a download — the file is generated async.
 */
import { useState } from "react";
import { X, Download, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/button";
import { requestAnalyticsExport } from "../export-actions";

const OPTIONAL_TABLES = [
  { key: "diners", label: "Clienți (date personale)" },
  { key: "reviews", label: "Recenzii" },
] as const;

export function ExportModal({
  organizationId,
  restaurantIds,
  onClose,
}: {
  organizationId: string;
  restaurantIds: string[];
  onClose: () => void;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includes, setIncludes] = useState<string[]>(["diners", "reviews"]);
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setIncludes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  async function submit() {
    setState("submitting");
    setError(null);
    const res = await requestAnalyticsExport({
      organizationId,
      requestedRestaurants: restaurantIds,
      tables: ["reservations", ...includes] as ("reservations" | "diners" | "reviews" | "campaigns")[],
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      format: "csv",
    });
    if (res.ok) {
      setState("done");
    } else {
      setState("error");
      setError(res.error ?? "Ceva n-a mers. Încearcă din nou.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-border bg-surface-white p-7 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary">Export</p>
            <h2 className="font-display text-2xl font-bold text-text-primary">Descarcă datele</h2>
          </div>
          <button onClick={onClose} aria-label="Închide" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {state === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <MailCheck size={36} className="text-brand-primary" />
            <p className="text-text-primary font-semibold">Pregătim exportul tău</p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Îți trimitem un link de descărcare pe email când e gata (~5 min).
            </p>
            <Button variant="secondary" onClick={onClose} className="mt-2">
              Am înțeles
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-text-secondary">De la</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 w-full rounded-button border border-border bg-surface-bg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-text-secondary">Până la</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 w-full rounded-button border border-border bg-surface-bg px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <fieldset>
                <legend className="text-xs font-semibold text-text-secondary mb-2">Include</legend>
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-sm text-text-muted">
                    <input type="checkbox" checked disabled className="accent-brand-primary" /> Rezervări (mereu incluse)
                  </span>
                  {OPTIONAL_TABLES.map((t) => (
                    <label key={t.key} className="flex items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={includes.includes(t.key)}
                        onChange={() => toggle(t.key)}
                        className="accent-brand-primary"
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Anulează
              </Button>
              <Button onClick={submit} disabled={state === "submitting"}>
                {state === "submitting" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Se trimite…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download size={16} /> Generează export
                  </span>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
