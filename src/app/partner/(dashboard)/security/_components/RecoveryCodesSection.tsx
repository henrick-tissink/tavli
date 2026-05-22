"use client";

import { useState, useTransition } from "react";
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
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRegenerate() {
    const confirmed = window.confirm(
      remaining > 0
        ? `This will invalidate your existing ${remaining} unused code(s). Continue?`
        : "Generate 10 fresh recovery codes?",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await actions.regenerateRecoveryCodes();
      if (result.ok && result.data) {
        setCodes(result.data.codes);
        setError(null);
      } else {
        setError(result.error ?? "Could not generate codes.");
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
      <h2 className="font-display text-2xl text-text-primary">Recovery codes</h2>
      <p className="text-text-secondary">
        Codes you save in a safe place. Each one signs you in once if you lose
        your authenticator. Using a recovery code disables your authenticator
        and prompts you to set up a new one.
      </p>
      <p className="text-sm text-text-muted">
        {remaining} of 10 codes remaining.
      </p>

      {codes ? (
        <div className="space-y-3">
          <div className="bg-surface-bg rounded-card border border-border p-4 font-mono text-sm grid grid-cols-2 gap-2">
            {codes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <p className="text-sm text-yellow-700">
            These codes will not be shown again. Save them now.
          </p>
          <button
            onClick={downloadTxt}
            className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg"
          >
            Download as .txt
          </button>
        </div>
      ) : (
        <button
          onClick={handleRegenerate}
          disabled={isPending}
          className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate new codes"}
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
