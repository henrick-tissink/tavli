"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/password-input";
import { useT } from "@/lib/i18n/messages-provider";
import {
  createAccount,
  type CreateAccountResult,
} from "@/app/(app)/onboard/[token]/account/actions";

interface Props {
  token: string;
  emailHint: string;
  proposedName: string | null;
}

export function AccountForm({ token, emailHint, proposedName }: Props) {
  const t = useT("partner.onboarding");
  const [state, action, pending] = useActionState<
    CreateAccountResult | undefined,
    FormData
  >(createAccount, undefined);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="fullName">
          {t("wizard.account.fullNameLabel")}
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          placeholder={
            proposedName
              ? t("wizard.account.fullNamePlaceholderProposed", { name: proposedName })
              : t("wizard.account.fullNamePlaceholder")
          }
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="email">
          {t("wizard.account.emailLabel")}
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
          {t("wizard.account.emailHint")}
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="password">
          {t("wizard.account.passwordLabel")}
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-xs text-text-muted">{t("wizard.account.passwordHint")}</p>
      </div>

      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <Button fullWidth disabled={pending} type="submit">
        {pending ? t("wizard.account.submitPending") : t("wizard.account.submit")}
      </Button>

      <p className="text-xs text-text-muted text-center">
        {t("wizard.account.terms")}
      </p>
    </form>
  );
}
