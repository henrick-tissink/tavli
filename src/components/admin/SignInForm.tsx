"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { signInAdmin, type SignInResult } from "@/app/admin/sign-in/actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInResult | undefined, FormData>(
    signInAdmin,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-text-primary" htmlFor="email">
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
        <label className="block text-sm font-medium text-text-primary" htmlFor="password">
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
        Admin accounts are provisioned by the Tavli team. Contact ops if you need
        access.
      </p>
    </form>
  );
}
