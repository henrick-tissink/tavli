"use client";

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { useAuth } from "@/lib/auth-context";

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

  const title = mode === "sign-in" ? "Conectează-te" : "Creează cont";
  const submitLabel =
    mode === "sign-in" ? "Conectează-te" : "Creează cont";

  return (
    <BottomSheet open={open} onClose={handleClose} title={title}>
      {needsConfirmation ? (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Ți-am trimis un email la <strong>{email}</strong>. Confirmă adresa
            pentru a finaliza contul, apoi conectează-te.
          </p>
          <Button fullWidth onClick={handleClose}>
            Am înțeles
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            autoComplete="email"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parolă (minim 6 caractere)"
            aria-label="Parolă"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
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
            {submitting ? "Se procesează…" : submitLabel}
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
                ? "Nu ai cont? Creează unul"
                : "Ai deja cont? Conectează-te"}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
