"use client";

import { useActionState } from "react";
import { changePasswordAction, type ActionResult } from "../actions";

export function PasswordSection() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    changePasswordAction,
    { ok: false },
  );

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-text-primary">Password</h2>
      <p className="text-text-secondary">
        Changing your password signs you out of all your sessions on every device.
      </p>
      <form action={formAction} className="space-y-3 max-w-sm">
        <label className="block text-sm text-text-secondary">
          Current password
          <input
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-button border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </label>
        <label className="block text-sm text-text-secondary">
          New password
          <input
            name="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 block w-full rounded-button border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </label>
        <label className="block text-sm text-text-secondary">
          Confirm new password
          <input
            name="confirm_password"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 block w-full rounded-button border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </label>
        {state.error && <p className="text-sm text-error">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}
