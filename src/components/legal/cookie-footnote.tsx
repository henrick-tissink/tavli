"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "tavli_cookies_ack";
const REPROMPT_AFTER_DAYS = 30;

const LEGAL_PATHS = new Set([
  "/confidentialitate",
  "/termeni",
  "/cookie-uri",
  "/anpc",
  "/en/privacy",
  "/en/terms",
  "/en/cookies",
  "/en/anpc",
  "/de/privacy",
  "/de/terms",
  "/de/cookies",
  "/de/anpc",
]);

const COPY = {
  ro: {
    body: "🍪 Folosim cookie-uri esențiale pentru autentificare și preferințe. Nu te urmărim.",
    details: "Detalii",
    ok: "OK",
    detailsHref: "/cookie-uri",
  },
  en: {
    body: "🍪 We use essential cookies for login and preferences. No tracking.",
    details: "Details",
    ok: "OK",
    detailsHref: "/en/cookies",
  },
  de: {
    body: "🍪 Wir verwenden essentielle Cookies für Anmeldung und Einstellungen. Kein Tracking.",
    details: "Details",
    ok: "OK",
    detailsHref: "/de/cookies",
  },
};

function isStillAcknowledged(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const ackTimestamp = Number(raw);
  if (Number.isNaN(ackTimestamp)) return false;
  const ageDays = (Date.now() - ackTimestamp) / (1000 * 60 * 60 * 24);
  return ageDays < REPROMPT_AFTER_DAYS;
}

export function CookieFootnote() {
  const pathname = usePathname();
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(isStillAcknowledged());
  }, []);

  if (LEGAL_PATHS.has(pathname)) return null;
  if (acknowledged) return null;

  const lang = pathname.startsWith("/de") ? "de" : pathname.startsWith("/en") ? "en" : "ro";
  const copy = COPY[lang];

  const handleAck = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setAcknowledged(true);
  };

  return (
    <div
      role="region"
      aria-label={lang === "ro" ? "Notificare cookie-uri" : "Cookie notice"}
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-white border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.04)]"
    >
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3 desktop:rounded-card desktop:mb-4 desktop:border desktop:shadow-card">
        <p className="text-sm text-text-primary flex-1">{copy.body}</p>
        <Link
          href={copy.detailsHref}
          className="text-sm font-semibold text-brand-primary hover:underline whitespace-nowrap"
        >
          {copy.details}
        </Link>
        <button
          type="button"
          onClick={handleAck}
          className="text-sm font-bold rounded-button bg-brand-primary text-white px-4 py-1.5 hover:bg-brand-primary-dark"
        >
          {copy.ok}
        </button>
      </div>
    </div>
  );
}
