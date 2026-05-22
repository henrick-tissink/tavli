"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import {
  signInPartner,
  type PartnerSignInResult,
} from "@/app/partner/sign-in/actions";

export function PartnerSignInForm() {
  const [state, action, pending] = useActionState<
    PartnerSignInResult | undefined,
    FormData
  >(signInPartner, undefined);
  const needsMfa = !!state && "state" in state && state.state === "needs_mfa";

  if (needsMfa) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="factor_id" value={state.factorId} />

        <div className="space-y-1">
          <label
            className="block text-sm font-medium text-text-primary"
            htmlFor="mfa_code"
          >
            Cod din aplicația de autentificare
          </label>
          <input
            id="mfa_code"
            name="mfa_code"
            inputMode="numeric"
            maxLength={6}
            pattern="\d{6}"
            autoFocus
            required
            autoComplete="one-time-code"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </div>

        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <Button fullWidth disabled={pending} type="submit">
          {pending ? "Se verifică…" : "Verifică și conectează-mă"}
        </Button>

        {state.hasRecoveryCodes && (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
              Folosește un cod de recuperare
            </summary>
            <div className="mt-3 space-y-3">
              <input
                name="recovery_code"
                placeholder="xxxx-xxxx-xx"
                autoComplete="off"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <p className="text-xs text-text-muted">
                Folosirea unui cod de recuperare îți va dezactiva
                autentificatorul. Vei putea seta unul nou după conectare.
              </p>
              <Button
                fullWidth
                variant="ghost"
                disabled={pending}
                type="submit"
              >
                Folosește codul de recuperare
              </Button>
            </div>
          </details>
        )}
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="password">
          Parolă
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state && "error" in state && state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <Button fullWidth disabled={pending} type="submit">
        {pending ? "Se conectează…" : "Conectează-te"}
      </Button>
      <p className="text-xs text-text-muted text-center">
        Încă nu ești partener? Ai nevoie de o invitație de la echipa Tavli.
      </p>
    </form>
  );
}
