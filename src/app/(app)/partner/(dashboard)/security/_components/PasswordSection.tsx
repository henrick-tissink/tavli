"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import type { ActionResult } from "../actions";

export interface PasswordActions {
  changePasswordAction: (
    prev: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
}

export function PasswordSection({ actions }: { actions: PasswordActions }) {
  const t = useT("partner.staffSecurity");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    actions.changePasswordAction,
    { ok: false },
  );

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-text-primary">{t("security.password.title")}</h2>
      <p className="text-text-secondary">
        {t("security.password.intro")}
      </p>
      <form action={formAction} className="space-y-3 max-w-sm">
        <label className="block text-sm text-text-secondary">
          {t("security.password.currentLabel")}
          <input
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-button border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </label>
        <label className="block text-sm text-text-secondary">
          {t("security.password.newLabel")}
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
          {t("security.password.confirmLabel")}
          <input
            name="confirm_password"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 block w-full rounded-button border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </label>
        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
        >
          {pending ? t("security.password.changing") : t("security.password.change")}
        </button>
      </form>
    </section>
  );
}
