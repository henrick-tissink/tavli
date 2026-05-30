"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import {
  createAccount,
  type CreateAccountResult,
} from "@/app/onboard/[token]/account/actions";

interface Props {
  token: string;
  emailHint: string;
  proposedName: string | null;
}

export function AccountForm({ token, emailHint, proposedName }: Props) {
  const [state, action, pending] = useActionState<
    CreateAccountResult | undefined,
    FormData
  >(createAccount, undefined);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="fullName">
          Numele tău
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          placeholder={proposedName ? `Manager la ${proposedName}` : "Andrei Popescu"}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>

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
          defaultValue={emailHint}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <p className="text-xs text-text-muted">
          Trebuie să fie aceeași adresă la care a fost trimisă invitația.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="password">
          Parolă
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-xs text-text-muted">Cel puțin 8 caractere.</p>
      </div>

      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <Button fullWidth disabled={pending} type="submit">
        {pending ? "Se creează contul…" : "Creează contul și continuă"}
      </Button>

      <p className="text-xs text-text-muted text-center">
        Continuând, ești de acord cu termenii pentru parteneri Tavli și cu
        politica noastră de confidențialitate.
      </p>
    </form>
  );
}
