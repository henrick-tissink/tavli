"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { resendVerificationAction, type ResendResult } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Introdu o adresă de email validă.",
  rate_limited: "Ai cerut prea multe linkuri. Încearcă din nou în câteva minute.",
  send_failed: "Nu am putut retrimite emailul. Încearcă din nou.",
};

export function ResendVerification({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action, pending] = useActionState<ResendResult | undefined, FormData>(
    resendVerificationAction,
    undefined,
  );

  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-secondary">Email</span>
        <input
          type="email"
          name="email"
          required
          defaultValue={defaultEmail ?? ""}
          className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Se trimite…" : "Retrimite emailul de confirmare"}
      </Button>
      {state?.ok && (
        <p className="text-sm text-emerald-700" role="status">
          Am retrimis emailul. Verifică-ți inboxul.
        </p>
      )}
      {state && !state.ok && (
        <p className="text-sm text-red-700" role="alert">
          {ERRORS[state.error ?? ""] ?? "A apărut o eroare."}
        </p>
      )}
    </form>
  );
}
