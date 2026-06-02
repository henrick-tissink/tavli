"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { localizedHref } from "@/lib/i18n/routing";

interface AuthSheetProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated?: () => void;
}

type Mode = "sign-in" | "sign-up";

export function AuthSheet({ open, onClose, onAuthenticated }: AuthSheetProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const t = useT("profile");
  const locale = useLocale();

  const canSubmit =
    !submitting && /\S+@\S+\.\S+/.test(email) && password.length >= 6;

  const reset = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setNeedsConfirmation(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    onClose();
    reset();
    setMode("sign-in");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const result =
      mode === "sign-in"
        ? await signIn(email, password)
        : await signUp(email, password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if ("needsConfirmation" in result && result.needsConfirmation) {
      setNeedsConfirmation(true);
      return;
    }

    onAuthenticated?.();
    handleClose();
  };

  const title = mode === "sign-in" ? t("auth.signInTitle") : t("auth.signUpTitle");
  const submitLabel = mode === "sign-in" ? t("auth.signInSubmit") : t("auth.signUpSubmit");
  const loadingLabel = mode === "sign-in" ? t("auth.signInLoading") : t("auth.signUpLoading");

  return (
    <BottomSheet open={open} onClose={handleClose} title={title}>
      {needsConfirmation ? (
        <div className="space-y-4">
          {/* Icon header */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="w-14 h-14 rounded-full bg-brand-primary-soft flex items-center justify-center">
              <Mail size={24} className="text-brand-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold text-text-primary text-center">
              {t("auth.confirmationTitle")}
            </h2>
            <p className="text-sm text-text-secondary text-center">
              {t("auth.confirmationBody", { email })}
            </p>
          </div>
          <Button fullWidth onClick={handleClose}>
            {t("auth.confirmationAck")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Icon header */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="w-14 h-14 rounded-full bg-brand-primary-soft flex items-center justify-center">
              <Mail size={24} className="text-brand-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold text-text-primary text-center">
              {title}
            </h2>
            <p className="text-sm text-text-secondary text-center">
              {mode === "sign-in"
                ? t("auth.signInSubtitle")
                : t("auth.signUpSubtitle")}
            </p>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            aria-label={t("auth.emailAriaLabel")}
            autoComplete="email"
            className="rounded-button border border-border px-3 py-2.5 w-full text-base focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary focus:bg-brand-primary-soft/40"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            aria-label={t("auth.passwordAriaLabel")}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="rounded-button border border-border px-3 py-2.5 w-full text-base focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary focus:bg-brand-primary-soft/40"
          />

          {error && (
            <p
              className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button fullWidth disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? loadingLabel : submitLabel}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
                setError(null);
              }}
              className="text-sm text-brand-primary font-semibold"
            >
              {mode === "sign-in"
                ? t("auth.switchToSignUp")
                : t("auth.switchToSignIn")}
            </button>
          </div>

          {/* Legal microcopy */}
          <div className="border-t border-border pt-3">
            <p className="text-xs text-text-muted text-center">
              {t("auth.legalPrefix")}{" "}
              <Link href={localizedHref("/termeni", locale)} className="underline hover:text-text-secondary">
                {t("auth.legalTerms")}
              </Link>{" "}
              {t("auth.legalAnd")}{" "}
              <Link href={localizedHref("/confidentialitate", locale)} className="underline hover:text-text-secondary">
                {t("auth.legalPrivacy")}
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
