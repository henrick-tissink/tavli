"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  cui: string;
  denumire: string;
  onChange: (p: { claimedCompanyCui: string; claimedCompanyName?: string }) => void;
}

interface LookupResult {
  denumire?: string;
  adresa?: string;
}

/**
 * Debounced live ANAF CUI lookup. Calls /api/anaf/lookup ~500ms after the
 * input settles. On success, surfaces the company name + address in a
 * tinted panel and bubbles the resolved denumire up to the parent.
 */
export function CuiLookupField({ cui, denumire, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // We only fire once the user has typed enough characters to make the
    // lookup worthwhile. Stripping the "RO" prefix matches what ANAF expects.
    if (!cui || cui.replace(/^RO/i, "").length < 4) {
      setResult(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/anaf/lookup?cui=${encodeURIComponent(cui)}`,
        );
        const json = (await res.json()) as {
          ok?: boolean;
          denumire?: string;
          adresa?: string;
        };
        if (json.ok) {
          setResult({ denumire: json.denumire, adresa: json.adresa });
          if (json.denumire) {
            onChange({ claimedCompanyCui: cui, claimedCompanyName: json.denumire });
          }
        } else {
          setResult(null);
        }
      } catch {
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // We intentionally do NOT include onChange in deps — the parent passes a
    // fresh callback on every render and we don't want the debounce reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cui]);

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">CUI</span>
        <div className="relative">
          <input
            value={cui}
            placeholder="RO12345678"
            onChange={(e) =>
              onChange({ claimedCompanyCui: e.target.value.trim() })
            }
            className="w-full mt-1 border border-border rounded-card p-2 pr-9 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {loading && (
              <Loader2
                className="w-4 h-4 animate-spin text-text-muted"
                aria-label="se caută"
              />
            )}
            {!loading && result?.denumire && (
              <CheckCircle2
                className="w-4 h-4 text-[color:var(--color-occasion-product)]"
                aria-label="găsit"
              />
            )}
          </span>
        </div>
      </label>
      {result?.denumire && (
        <p className="mt-1.5 text-xs bg-[color:var(--color-occasion-product-soft)] rounded p-2">
          <strong className="text-text-primary">{result.denumire}</strong>
          {result.adresa ? (
            <>
              <br />
              <span className="text-text-secondary">{result.adresa}</span>
            </>
          ) : null}
        </p>
      )}
      {denumire && !result && (
        <p className="mt-1 text-xs text-text-secondary">Denumire: {denumire}</p>
      )}
    </div>
  );
}
