"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { resendVerificationAction, type ResendResult } from "./actions";

/** Maps resend-action error codes to message keys under `auth.errors`. */
const ERROR_KEYS: Record<string, string> = {
  invalid: "auth.errors.resendInvalidEmail",
  rate_limited: "auth.errors.resendRateLimited",
  send_failed: "auth.errors.resendSendFailed",
};

export function ResendVerification({ defaultEmail }: { defaultEmail?: string }) {
  const t = useT("partner.onboarding");
  const [state, action, pending] = useActionState<ResendResult | undefined, FormData>(
    resendVerificationAction,
    undefined,
  );

  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-secondary">{t("auth.verifyEmail.emailLabel")}</span>
        <input
          type="email"
          name="email"
          required
          defaultValue={defaultEmail ?? ""}
          className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.verifyEmail.resendSubmitPending") : t("auth.verifyEmail.resendSubmit")}
      </Button>
      {state?.ok && (
        <p className="text-sm text-emerald-700" role="status">
          {t("auth.verifyEmail.resendSuccess")}
        </p>
      )}
      {state && !state.ok && (
        <p className="text-sm text-red-700" role="alert">
          {t(ERROR_KEYS[state.error ?? ""] ?? "auth.errors.resendGeneric")}
        </p>
      )}
    </form>
  );
}
