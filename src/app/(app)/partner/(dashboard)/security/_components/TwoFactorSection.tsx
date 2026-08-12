"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";
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

function VerifyButton({ reloading }: { reloading: boolean }) {
  const { pending } = useFormStatus();
  const t = useT("partner.staffSecurity");
  // `reloading` covers the gap between a successful verify and the document
  // reload actually happening — useFormStatus has already gone idle by then.
  const busy = pending || reloading;
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      className="inline-flex items-center gap-2 rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
    >
      {busy && <Spinner />}
      {busy ? t("security.twoFactor.enrol.verifying") : t("security.twoFactor.enrol.verify")}
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
  // Enrolling and un-enrolling change the session's assurance level, so these
  // deliberately keep the full document reload (router.refresh() would leave the
  // client holding a stale AAL). `reloading` keeps the control visibly busy from
  // the moment the action succeeds until the new document paints.
  const [reloading, setReloading] = useState(false);
  // Which factor is being removed, so one row's spinner does not dim the others.
  const [unenrolling, setUnenrolling] = useState<string | null>(null);
  const unenrollingId = isPending || reloading ? unenrolling : null;

  function beginEnrol() {
    setUnenrolling(null);
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
    if (!enrolment || reloading) return;
    formData.set("factor_id", enrolment.factorId);
    const result = await actions.verifyTotpStep({ ok: false }, formData);
    if (!result.ok) {
      setVerifyError(result.error ?? t("security.twoFactor.enrol.errorIncorrect"));
      return;
    }
    // Stay on the enrolment screen with the button busy rather than flashing
    // the (stale) factor list for the frame before the reload lands.
    setReloading(true);
    window.location.reload();
  }

  function submitUnenrol(factorId: string) {
    if (reloading) return;
    const fd = new FormData();
    fd.set("factor_id", factorId);
    setUnenrolling(factorId);
    startTransition(async () => {
      const result = await actions.unenrolFactorAction({ ok: false }, fd);
      if (!result.ok) {
        setUnenrolError(result.error ?? t("security.twoFactor.errorRemove"));
      } else {
        setReloading(true);
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
          <VerifyButton reloading={reloading} />
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
          aria-busy={isPending || undefined}
          className="inline-flex items-center gap-2 rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
        >
          {isPending && <Spinner />}
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
            disabled={unenrollingId === f.id}
            aria-busy={unenrollingId === f.id || undefined}
            className="inline-flex items-center gap-1.5 text-sm text-error hover:underline disabled:opacity-50"
          >
            {unenrollingId === f.id && <Spinner size={14} />}
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
