"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { signupPartnerAction, type SignupActionResult } from "./actions";

/** Maps server-action error codes to message keys under `auth.errors`. */
const ERROR_KEYS: Record<string, string> = {
  invalid_input: "auth.errors.signUpInvalidInput",
  conflict: "auth.errors.signUpConflict",
  rate_limited: "auth.errors.signUpRateLimited",
  TV1401: "auth.errors.signUpTrialUsed",
  TV1403: "auth.errors.signUpTaxIdClaimed",
  internal: "auth.errors.signUpInternal",
};

const fieldClass =
  "w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-text-secondary";

export function SignUpForm({ cities }: { cities: { id: string; name: string }[] }) {
  const t = useT("partner.onboarding");
  const [state, action, pending] = useActionState<SignupActionResult | undefined, FormData>(
    signupPartnerAction,
    undefined,
  );
  const [step, setStep] = useState(0);

  const steps = [
    t("auth.signUp.steps.account"),
    t("auth.signUp.steps.restaurant"),
    t("auth.signUp.steps.plan"),
  ];

  return (
    <form action={action} className="space-y-6">
      {/* Progress */}
      <ol className="flex items-center gap-2" aria-label={t("auth.signUp.stepsAriaLabel")}>
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i <= step ? "bg-brand-primary text-white" : "bg-surface-bg text-text-muted",
              ].join(" ")}
              aria-current={i === step ? "step" : undefined}
            >
              {i + 1}
            </span>
            <span className={`text-xs ${i === step ? "text-text-primary font-semibold" : "text-text-muted"}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {/* Step 1 — account */}
      <div hidden={step !== 0} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="su-email">{t("auth.signUp.emailLabel")}</label>
          <input id="su-email" name="email" type="email" required autoComplete="email" className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="su-password">{t("auth.signUp.passwordLabel")}</label>
          <input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={fieldClass} />
          <p className="mt-1 text-xs text-text-muted">{t("auth.signUp.passwordHint")}</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="su-name">{t("auth.signUp.fullNameLabel")}</label>
          <input id="su-name" name="fullName" type="text" required autoComplete="name" className={fieldClass} />
        </div>
      </div>

      {/* Step 2 — restaurant + org */}
      <div hidden={step !== 1} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="su-rname">{t("auth.signUp.restaurantNameLabel")}</label>
          <input id="su-rname" name="restaurantName" type="text" required className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="su-city">{t("auth.signUp.cityLabel")}</label>
          <select id="su-city" name="cityId" required defaultValue="" className={fieldClass}>
            <option value="" disabled>{t("auth.signUp.cityPlaceholder")}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="su-org">
            {t("auth.signUp.orgNameLabel")} <span className="text-text-muted">{t("auth.signUp.orgNameOptional")}</span>
          </label>
          <input id="su-org" name="organizationName" type="text" placeholder={t("auth.signUp.orgNamePlaceholder")} className={fieldClass} />
        </div>
        <input type="hidden" name="countryCode" value="RO" />
      </div>

      {/* Step 3 — legal + plan + terms */}
      <div hidden={step !== 2} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="su-tax">
            {t("auth.signUp.taxIdLabel")} <span className="text-text-muted">{t("auth.signUp.taxIdOptional")}</span>
          </label>
          <input id="su-tax" name="taxId" type="text" className={fieldClass} />
          <p className="mt-1 text-xs text-text-muted">{t("auth.signUp.taxIdHint")}</p>
        </div>
        <div>
          <span className={labelClass}>{t("auth.signUp.customerTypeLabel")}</span>
          <div className="flex gap-4 text-sm text-text-secondary">
            <label className="flex items-center gap-2">
              <input type="radio" name="customerType" value="business" /> {t("auth.signUp.customerTypeBusiness")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="customerType" value="personal" /> {t("auth.signUp.customerTypePersonal")}
            </label>
          </div>
        </div>
        <div>
          <span className={labelClass}>{t("auth.signUp.planLabel")}</span>
          <div className="grid grid-cols-2 gap-3">
            <label className="cursor-pointer rounded-lg border border-border p-3 text-sm has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary-soft">
              <input type="radio" name="tier" value="base" defaultChecked className="sr-only" />
              <span className="font-semibold text-text-primary">{t("auth.signUp.planBaseName")}</span>
              <span className="block text-text-muted">{t("auth.signUp.planBasePrice")}</span>
            </label>
            <label className="cursor-pointer rounded-lg border border-border p-3 text-sm has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary-soft">
              <input type="radio" name="tier" value="pro" className="sr-only" />
              <span className="font-semibold text-text-primary">{t("auth.signUp.planProName")}</span>
              <span className="block text-text-muted">{t("auth.signUp.planProPrice")}</span>
            </label>
          </div>
        </div>
        <div>
          <span className={labelClass}>{t("auth.signUp.frequencyLabel")}</span>
          <div className="flex gap-4 text-sm text-text-secondary">
            <label className="flex items-center gap-2">
              <input type="radio" name="frequency" value="monthly" defaultChecked /> {t("auth.signUp.frequencyMonthly")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="frequency" value="annual" /> {t("auth.signUp.frequencyAnnual")}
            </label>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <input type="checkbox" name="termsAccepted" required className="mt-0.5" />
          <span>
            {t("auth.signUp.termsPrefix")}{" "}
            <a href="/termeni" className="text-brand-primary hover:underline" target="_blank" rel="noreferrer">
              {t("auth.signUp.termsLink")}
            </a>{" "}
            {t("auth.signUp.termsAnd")}{" "}
            <a href="/prelucrare-date" className="text-brand-primary hover:underline" target="_blank" rel="noreferrer">
              {t("auth.signUp.privacyLink")}
            </a>
            .
          </span>
        </label>
        <p className="text-xs text-text-muted">
          {t("auth.signUp.trialNotice")}
        </p>
      </div>

      {state && !state.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {t(ERROR_KEYS[state.code] ?? "auth.errors.signUpGeneric")}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="text-sm font-semibold text-text-secondary hover:text-text-primary disabled:opacity-0"
        >
          {t("auth.signUp.back")}
        </button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
            {t("auth.signUp.continue")}
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? t("auth.signUp.submitPending") : t("auth.signUp.submit")}
          </Button>
        )}
      </div>
    </form>
  );
}
