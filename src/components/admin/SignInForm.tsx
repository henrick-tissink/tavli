"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import { useT } from "@/lib/i18n/messages-provider";
import { signInAdmin, type SignInResult } from "@/app/(app)/admin/sign-in/actions";

export function SignInForm({
  initialState,
}: {
  initialState?: SignInResult;
} = {}) {
  const t = useT("admin.auth");
  const [state, action, pending] = useActionState<SignInResult | undefined, FormData>(
    signInAdmin,
    initialState,
  );
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
            {t("form.mfaCodeLabel")}
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
          {pending ? t("form.mfaSubmitPending") : t("form.mfaSubmit")}
        </Button>

        {state.hasRecoveryCodes && (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
              {t("form.recoveryToggle")}
            </summary>
            <div className="mt-3 space-y-3">
              <input
                name="recovery_code"
                placeholder={t("form.recoveryPlaceholder")}
                autoComplete="off"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <p className="text-xs text-text-muted">
                {t("form.recoveryHint")}
              </p>
              <Button
                fullWidth
                variant="ghost"
                disabled={pending}
                type="submit"
              >
                {t("form.recoverySubmit")}
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
        <label className="block text-sm font-medium text-text-primary" htmlFor="email">
          {t("form.emailLabel")}
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
          {t("form.passwordLabel")}
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
        {pending ? t("form.submitPending") : t("form.submit")}
      </Button>

      <p className="text-xs text-text-muted text-center">
        {t("form.createdByTeam")}
      </p>
    </form>
  );
}
