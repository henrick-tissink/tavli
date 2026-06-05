"use client";

import { useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { setLocaleCookieClient } from "@/lib/i18n/cookie-client";
import { useLocale } from "@/lib/i18n/messages-provider";

const LOCALE_LABEL: Record<Locale, string> = {
  ro: "Română", // i18n-allow — endonym: language names stay in their own language
  en: "English",
  de: "Deutsch",
};

/**
 * Locale picker for pre-auth (app) pages (partner/admin sign-in, sign-up).
 * These pages have no URL locale segment and no profile locale yet, so the
 * NEXT_LOCALE cookie is the only user-controllable signal — this sets it and
 * refreshes so the server re-renders in the chosen language. Post-auth pages
 * don't need it: the profile locale wins in resolveAppLocale.
 */
export function AuthLocaleSwitcher() {
  const router = useRouter();
  const locale = useLocale();

  return (
    <nav aria-label="Language" className="flex items-center gap-2 text-xs">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-border">·</span>}
          {l === locale ? (
            <span className="font-bold text-text-primary">{LOCALE_LABEL[l]}</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setLocaleCookieClient(l);
                router.refresh();
              }}
              className="text-text-muted hover:text-text-primary"
            >
              {LOCALE_LABEL[l]}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
