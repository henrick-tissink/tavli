"use client";

/**
 * Export modal — collects date range + included tables and calls
 * requestAnalyticsExport. On success it shows the "we'll email you" state
 * (§7.4) rather than a download — the file is generated async.
 */
import { useState } from "react";
import { X, Download, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { requestAnalyticsExport } from "../export-actions";

const OPTIONAL_TABLES = [
  { key: "diners" },
  { key: "reviews" },
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
  const t = useT("partner.analytics");
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
      setError(res.error ?? t("export.genericError"));
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary">{t("export.eyebrow")}</p>
            <h2 className="font-display text-2xl font-bold text-text-primary">{t("export.title")}</h2>
          </div>
          <button onClick={onClose} aria-label={t("export.close")} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {state === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <MailCheck size={36} className="text-brand-primary" />
            <p className="text-text-primary font-semibold">{t("export.doneTitle")}</p>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t("export.doneBody")}
            </p>
            <Button variant="secondary" onClick={onClose} className="mt-2">
              {t("export.doneAck")}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-text-secondary">{t("export.dateFrom")}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 w-full rounded-button border border-border bg-surface-bg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-text-secondary">{t("export.dateTo")}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 w-full rounded-button border border-border bg-surface-bg px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <fieldset>
                <legend className="text-xs font-semibold text-text-secondary mb-2">{t("export.includeLegend")}</legend>
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-sm text-text-muted">
                    <input type="checkbox" checked disabled className="accent-brand-primary" /> {t("export.reservationsAlways")}
                  </span>
                  {OPTIONAL_TABLES.map((tbl) => (
                    <label key={tbl.key} className="flex items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={includes.includes(tbl.key)}
                        onChange={() => toggle(tbl.key)}
                        className="accent-brand-primary"
                      />
                      {t(`export.tables.${tbl.key}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t("export.cancel")}
              </Button>
              <Button onClick={submit} disabled={state === "submitting"}>
                {state === "submitting" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> {t("export.submitting")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download size={16} /> {t("export.submit")}
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
