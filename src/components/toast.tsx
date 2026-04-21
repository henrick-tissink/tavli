"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastKind = "success" | "error";
interface ToastPayload {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (t: ToastPayload) => void;
const listeners = new Set<Listener>();
let counter = 0;

function emit(kind: ToastKind, message: string) {
  const payload: ToastPayload = { id: ++counter, kind, message };
  listeners.forEach((l) => l(payload));
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
};

const DEFAULT_DURATION_MS = 4000;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, DEFAULT_DURATION_MS);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed z-[60] top-4 right-4 left-4 desktop:left-auto desktop:w-96 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-3 rounded-card border px-4 py-3 shadow-card bg-surface-white animate-slide-in-right ${
            t.kind === "success"
              ? "border-emerald-200"
              : "border-red-200"
          }`}
        >
          {t.kind === "success" ? (
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm text-text-primary flex-1 leading-snug">{t.message}</p>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            aria-label="Dismiss"
            className="text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
