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
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          placeholder={proposedName ? `Manager at ${proposedName}` : "Andrei Popescu"}
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
          Must match the email the invitation was sent to.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-xs text-text-muted">At least 8 characters.</p>
      </div>

      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <Button fullWidth disabled={pending} type="submit">
        {pending ? "Creating account…" : "Create account & continue"}
      </Button>

      <p className="text-xs text-text-muted text-center">
        By continuing you agree to Tavli&apos;s partner terms and our privacy
        policy.
      </p>
    </form>
  );
}
