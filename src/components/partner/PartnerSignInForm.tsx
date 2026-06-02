"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import { useT } from "@/lib/i18n/messages-provider";
import {
  signInPartner,
  type PartnerSignInResult,
} from "@/app/(app)/partner/sign-in/actions";

export function PartnerSignInForm({
  initialState,
}: {
  initialState?: PartnerSignInResult;
} = {}) {
  const t = useT("partner.onboarding");
  const [state, action, pending] = useActionState<
    PartnerSignInResult | undefined,
    FormData
  >(signInPartner, initialState);
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
            {t("auth.signIn.mfaCodeLabel")}
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
          {pending ? t("auth.signIn.mfaSubmitPending") : t("auth.signIn.mfaSubmit")}
        </Button>

        {state.hasRecoveryCodes && (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
              {t("auth.signIn.recoveryToggle")}
            </summary>
            <div className="mt-3 space-y-3">
              <input
                name="recovery_code"
                placeholder="xxxx-xxxx-xx"
                autoComplete="off"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <p className="text-xs text-text-muted">
                {t("auth.signIn.recoveryHint")}
              </p>
              <Button
                fullWidth
                variant="ghost"
                disabled={pending}
                type="submit"
              >
                {t("auth.signIn.recoverySubmit")}
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
          {t("auth.signIn.emailLabel")}
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
          {t("auth.signIn.passwordLabel")}
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
        {pending ? t("auth.signIn.submitPending") : t("auth.signIn.submit")}
      </Button>
      <p className="text-xs text-text-muted text-center">
        {t("auth.signIn.notPartnerHint")}
      </p>
    </form>
  );
}
