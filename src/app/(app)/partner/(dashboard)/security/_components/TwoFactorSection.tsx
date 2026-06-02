"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { BCP47 } from "@/lib/i18n/locale";
import type { ActionResult } from "../actions";

export interface TwoFactorActions {
  startTotpEnrolment: () => Promise<
    ActionResult<{
      factorId: string;
      qrCodeSvg: string;
      uri: string;
      secret: string;
    }>
  >;
  verifyTotpStep: (
    prev: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
  unenrolFactorAction: (
    prev: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
}

function VerifyButton() {
  const { pending } = useFormStatus();
  const t = useT("partner.staffSecurity");
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
    >
      {pending ? t("security.twoFactor.enrol.verifying") : t("security.twoFactor.enrol.verify")}
    </button>
  );
}

interface Factor {
  id: string;
  friendlyName: string | null;
  createdAt: string;
}

export function TwoFactorSection({
  factors,
  actions,
}: {
  factors: Factor[];
  actions: TwoFactorActions;
}) {
  const t = useT("partner.staffSecurity");
  const locale = useLocale();
  const [enrolment, setEnrolment] = useState<{
    factorId: string;
    qrCodeSvg: string;
    secret: string;
  } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [unenrolError, setUnenrolError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function beginEnrol() {
    startTransition(async () => {
      const result = await actions.startTotpEnrolment();
      if (!result.ok || !result.data) {
        setVerifyError(result.error ?? t("security.twoFactor.enrol.errorStart"));
        return;
      }
      setEnrolment({
        factorId: result.data.factorId,
        qrCodeSvg: result.data.qrCodeSvg,
        secret: result.data.secret,
      });
    });
  }

  async function submitVerify(formData: FormData) {
    if (!enrolment) return;
    formData.set("factor_id", enrolment.factorId);
    const result = await actions.verifyTotpStep({ ok: false }, formData);
    if (!result.ok) {
      setVerifyError(result.error ?? t("security.twoFactor.enrol.errorIncorrect"));
      return;
    }
    setEnrolment(null);
    window.location.reload();
  }

  function submitUnenrol(factorId: string) {
    const fd = new FormData();
    fd.set("factor_id", factorId);
    startTransition(async () => {
      const result = await actions.unenrolFactorAction({ ok: false }, fd);
      if (!result.ok) {
        setUnenrolError(result.error ?? t("security.twoFactor.errorRemove"));
      } else {
        window.location.reload();
      }
    });
  }

  if (enrolment) {
    return (
      <section className="space-y-6">
        <h2 className="font-display text-2xl text-text-primary">
          {t("security.twoFactor.enrol.title")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("security.twoFactor.enrol.intro")}
        </p>
        <div
          className="bg-surface-white p-4 inline-block rounded-card border border-border"
          dangerouslySetInnerHTML={{ __html: enrolment.qrCodeSvg }}
        />
        <p className="text-sm text-text-secondary">
          {t("security.twoFactor.enrol.secretIntro")}{" "}
          <code className="font-mono text-text-primary">{enrolment.secret}</code>
        </p>
        <form action={submitVerify} className="space-y-3 max-w-xs">
          <label className="block text-sm text-text-secondary">
            {t("security.twoFactor.enrol.codeLabel")}
            <input
              name="code"
              inputMode="numeric"
              maxLength={6}
              pattern="\d{6}"
              required
              autoFocus
              className="mt-1 block w-full rounded-button border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </label>
          {verifyError && (
            <p className="text-sm text-error" role="alert">
              {verifyError}
            </p>
          )}
          <VerifyButton />
        </form>
      </section>
    );
  }

  if (factors.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-2xl text-text-primary">
          {t("security.twoFactor.title")}
        </h2>
        <p className="text-text-secondary">
          {t("security.twoFactor.introDisabled")}
        </p>
        {verifyError && (
          <p className="text-sm text-error" role="alert">
            {verifyError}
          </p>
        )}
        <button
          onClick={beginEnrol}
          disabled={isPending}
          className="rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
        >
          {isPending ? t("security.twoFactor.settingUp") : t("security.twoFactor.setUp")}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-text-primary">
        {t("security.twoFactor.title")}
      </h2>
      <p className="text-text-secondary">
        {t("security.twoFactor.enabledText")}
      </p>
      {factors.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between p-4 rounded-card border border-border"
        >
          <div>
            <div className="font-medium text-text-primary">
              {f.friendlyName ?? t("security.twoFactor.factorFallback")}
            </div>
            <div className="text-sm text-text-muted">
              {t("security.twoFactor.added", {
                date: new Date(f.createdAt).toLocaleDateString(BCP47[locale]),
              })}
            </div>
          </div>
          <button
            onClick={() => submitUnenrol(f.id)}
            disabled={isPending}
            className="text-sm text-error hover:underline disabled:opacity-50"
          >
            {t("security.twoFactor.remove")}
          </button>
        </div>
      ))}
      {unenrolError && (
        <p className="text-sm text-error" role="alert">
          {unenrolError}
        </p>
      )}
    </section>
  );
}
