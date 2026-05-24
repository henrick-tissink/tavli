"use client";

/**
 * §15 §12 / §18 OQ8 — wait-list CTA shown in place of "Start free trial" when
 * PARTNER_SIGNUP_ENABLED is off. Opens an accessible email-collection modal and
 * calls the joinWaitlist action, mapping its error code to localised copy.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { PricingMessages } from "@/lib/i18n/load-messages";
import { joinWaitlist } from "@/app/pricing/actions";

type Status = "idle" | "submitting" | "success" | "error";

function codeToMessage(code: string, w: PricingMessages["waitlist"]): string {
  switch (code) {
    case "TV1301":
      return w.errorDuplicate;
    case "invalid_input":
      return w.errorInvalid;
    case "rate_limited":
      return w.errorRateLimited;
    default:
      return w.errorGeneric;
  }
}

export function WaitlistButton({
  messages,
  locale,
  featured,
}: {
  messages: PricingMessages;
  locale: string;
  featured: boolean;
}) {
  const w = messages.waitlist;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus("submitting");
    setError(null);
    const result = await joinWaitlist({
      email: String(form.get("email") ?? ""),
      organizationNameHint: String(form.get("org") ?? "") || undefined,
      locale,
    });
    if (result.ok) {
      setStatus("success");
    } else {
      setStatus("error");
      setError(codeToMessage(result.code, w));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setStatus("idle");
          setError(null);
        }}
        className={[
          "mt-7 inline-flex min-h-[48px] items-center justify-center rounded-button px-6 py-3 text-sm font-bold transition-all active:scale-[0.98]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
          featured
            ? "bg-brand-primary text-white shadow-card hover:bg-brand-primary-dark"
            : "bg-text-primary text-surface-white hover:bg-text-primary/90",
        ].join(" ")}
      >
        {w.cta}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-card bg-surface-white p-7 shadow-modal"
          >
            {status === "success" ? (
              <div className="text-center">
                <p className="font-display text-xl font-bold text-text-primary">{w.modalTitle}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{w.success}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-6 inline-flex min-h-[44px] items-center rounded-button bg-text-primary px-5 py-2.5 text-sm font-bold text-surface-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  {w.close}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 id={titleId} className="font-display text-xl font-bold text-text-primary">
                  {w.modalTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{w.modalBody}</p>

                <label className="mt-5 block text-sm font-semibold text-text-primary" htmlFor={`${titleId}-email`}>
                  {w.emailLabel}
                </label>
                <input
                  ref={emailRef}
                  id={`${titleId}-email`}
                  name="email"
                  type="email"
                  required
                  placeholder={w.emailPlaceholder}
                  className="mt-1.5 w-full rounded-button border border-border bg-surface-bg px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
                />

                <label className="mt-4 block text-sm font-semibold text-text-primary" htmlFor={`${titleId}-org`}>
                  {w.orgLabel}
                </label>
                <input
                  id={`${titleId}-org`}
                  name="org"
                  type="text"
                  placeholder={w.orgPlaceholder}
                  className="mt-1.5 w-full rounded-button border border-border bg-surface-bg px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
                />

                {error && (
                  <p className="mt-3 text-sm font-medium text-error" role="alert">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="min-h-[44px] rounded-button px-4 py-2.5 text-sm font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  >
                    {w.close}
                  </button>
                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="min-h-[44px] rounded-button bg-brand-primary px-6 py-2.5 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  >
                    {w.submit}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
