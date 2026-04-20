"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import {
  signInPartner,
  type PartnerSignInResult,
} from "@/app/partner/sign-in/actions";

export function PartnerSignInForm() {
  const [state, action, pending] = useActionState<
    PartnerSignInResult | undefined,
    FormData
  >(signInPartner, undefined);

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
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>
      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <Button fullWidth disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-xs text-text-muted text-center">
        Not a partner yet? You need an invitation from the Tavli team.
      </p>
    </form>
  );
}
