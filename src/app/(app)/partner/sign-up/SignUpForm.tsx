"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { signupPartnerAction, type SignupActionResult } from "./actions";

const ERRORS: Record<string, string> = {
  invalid_input: "Verifică datele introduse.",
  conflict: "Există deja un cont cu acest email. Conectează-te în schimb.",
  rate_limited: "Prea multe încercări. Încearcă din nou mai târziu.",
  TV1401: "Acest cod fiscal a folosit deja o perioadă de probă. Scrie-ne pentru ajutor.",
  TV1403: "Acest cod fiscal este deja revendicat de altă organizație.",
  internal: "Ceva n-a mers. Te rugăm să încerci din nou.",
};

const STEPS = ["Cont", "Restaurant", "Plan"] as const;

const fieldClass =
  "w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-text-secondary";

export function SignUpForm({ cities }: { cities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SignupActionResult | undefined, FormData>(
    signupPartnerAction,
    undefined,
  );
  const [step, setStep] = useState(0);

  return (
    <form action={action} className="space-y-6">
      {/* Progress */}
      <ol className="flex items-center gap-2" aria-label="Pași">
        {STEPS.map((label, i) => (
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
          <label className={labelClass} htmlFor="su-email">Email</label>
          <input id="su-email" name="email" type="email" required autoComplete="email" className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="su-password">Parolă</label>
          <input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={fieldClass} />
          <p className="mt-1 text-xs text-text-muted">Minimum 8 caractere.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="su-name">Numele tău</label>
          <input id="su-name" name="fullName" type="text" required autoComplete="name" className={fieldClass} />
        </div>
      </div>

      {/* Step 2 — restaurant + org */}
      <div hidden={step !== 1} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="su-rname">Numele restaurantului</label>
          <input id="su-rname" name="restaurantName" type="text" required className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="su-city">Oraș</label>
          <select id="su-city" name="cityId" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Alege orașul…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="su-org">
            Numele organizației <span className="text-text-muted">(opțional)</span>
          </label>
          <input id="su-org" name="organizationName" type="text" placeholder="Implicit: numele restaurantului" className={fieldClass} />
        </div>
        <input type="hidden" name="countryCode" value="RO" />
      </div>

      {/* Step 3 — legal + plan + terms */}
      <div hidden={step !== 2} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="su-tax">
            Cod fiscal / CUI <span className="text-text-muted">(opțional acum)</span>
          </label>
          <input id="su-tax" name="taxId" type="text" className={fieldClass} />
          <p className="mt-1 text-xs text-text-muted">Îl poți adăuga mai târziu, înainte de facturare.</p>
        </div>
        <div>
          <span className={labelClass}>Tip de client</span>
          <div className="flex gap-4 text-sm text-text-secondary">
            <label className="flex items-center gap-2">
              <input type="radio" name="customerType" value="business" /> Companie
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="customerType" value="personal" /> Persoană fizică
            </label>
          </div>
        </div>
        <div>
          <span className={labelClass}>Plan</span>
          <div className="grid grid-cols-2 gap-3">
            <label className="cursor-pointer rounded-lg border border-border p-3 text-sm has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary-soft">
              <input type="radio" name="tier" value="base" defaultChecked className="sr-only" />
              <span className="font-semibold text-text-primary">Tavli</span>
              <span className="block text-text-muted">€30 / lună</span>
            </label>
            <label className="cursor-pointer rounded-lg border border-border p-3 text-sm has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary-soft">
              <input type="radio" name="tier" value="pro" className="sr-only" />
              <span className="font-semibold text-text-primary">Tavli Pro</span>
              <span className="block text-text-muted">€60 / lună</span>
            </label>
          </div>
        </div>
        <div>
          <span className={labelClass}>Facturare</span>
          <div className="flex gap-4 text-sm text-text-secondary">
            <label className="flex items-center gap-2">
              <input type="radio" name="frequency" value="monthly" defaultChecked /> Lunar
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="frequency" value="annual" /> Anual
            </label>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <input type="checkbox" name="termsAccepted" required className="mt-0.5" />
          <span>
            Sunt de acord cu{" "}
            <a href="/termeni" className="text-brand-primary hover:underline" target="_blank" rel="noreferrer">
              Termenii
            </a>{" "}
            și{" "}
            <a href="/prelucrare-date" className="text-brand-primary hover:underline" target="_blank" rel="noreferrer">
              prelucrarea datelor
            </a>
            .
          </span>
        </label>
        <p className="text-xs text-text-muted">
          Începi cu o perioadă de probă de 3 luni. Nu se percep costuri acum.
        </p>
      </div>

      {state && !state.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {ERRORS[state.code] ?? "Nu am putut crea contul."}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="text-sm font-semibold text-text-secondary hover:text-text-primary disabled:opacity-0"
        >
          Înapoi
        </button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Continuă
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Se creează…" : "Creează contul"}
          </Button>
        )}
      </div>
    </form>
  );
}
