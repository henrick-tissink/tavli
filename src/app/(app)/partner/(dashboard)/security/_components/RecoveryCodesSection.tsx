"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import type { ActionResult } from "../actions";

export interface RecoveryCodesActions {
  regenerateRecoveryCodes: () => Promise<ActionResult<{ codes: string[] }>>;
}

export function RecoveryCodesSection({
  remaining,
  actions,
}: {
  remaining: number;
  actions: RecoveryCodesActions;
}) {
  const t = useT("partner.staffSecurity");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRegenerate() {
    const confirmed = window.confirm(
      remaining > 0
        ? t("security.recovery.confirmInvalidate", { remaining })
        : t("security.recovery.confirmFresh"),
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await actions.regenerateRecoveryCodes();
      if (result.ok && result.data) {
        setCodes(result.data.codes);
        setError(null);
      } else {
        setError(result.error ?? t("security.recovery.errorGenerate"));
      }
    });
  }

  function downloadTxt() {
    if (!codes) return;
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tavli-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-text-primary">{t("security.recovery.title")}</h2>
      <p className="text-text-secondary">
        {t("security.recovery.intro")}
      </p>
      <p className="text-sm text-text-muted">
        {t("security.recovery.remaining", { remaining })}
      </p>

      {codes ? (
        <div className="space-y-3">
          <div className="bg-surface-bg rounded-card border border-border p-4 font-mono text-sm grid grid-cols-2 gap-2">
            {codes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <p className="text-sm text-yellow-700">
            {t("security.recovery.warning")}
          </p>
          <button
            onClick={downloadTxt}
            className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg"
          >
            {t("security.recovery.download")}
          </button>
        </div>
      ) : (
        <button
          onClick={handleRegenerate}
          disabled={isPending}
          className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg disabled:opacity-50"
        >
          {isPending ? t("security.recovery.generating") : t("security.recovery.generate")}
        </button>
      )}
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
