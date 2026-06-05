"use client";

import Link from "next/link";
import { LOCALES, LOCALE_ENDONYMS, type Locale } from "@/lib/i18n/locale";
import { withLocale } from "@/lib/i18n/routing";
import { setAppLocale } from "@/app/(app)/locale-action";
import { setLocaleCookieClient } from "@/lib/i18n/cookie-client";

/** Full language names — used as the accessible label (and tooltip). */
const LABEL = LOCALE_ENDONYMS;
/** Compact codes shown in the segmented control to keep the chrome tidy. */
const CODE: Record<Locale, string> = { ro: "RO", en: "EN", de: "DE" };

type Props =
  | { mode: "path"; current: Locale; pathname: string }
  | { mode: "preference"; current: Locale };

/** Shared segmented-control track. */
const TRACK =
  "inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-bg p-0.5";

/** Per-segment classes; the active locale reads as a raised white chip. */
function segment(active: boolean): string {
  return [
    "px-2.5 py-1 text-xs font-semibold rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
    active
      ? "bg-surface-white text-brand-primary shadow-sm"
      : "text-text-muted hover:text-text-primary",
  ].join(" ");
}

export function LocaleSwitcher(props: Props) {
  if (props.mode === "path") {
    return (
      <nav aria-label="Language" className={TRACK}>
        {LOCALES.map((l) => (
          <Link
            key={l}
            href={withLocale(props.pathname, l)}
            aria-current={l === props.current ? "true" : undefined}
            aria-label={LABEL[l]}
            title={LABEL[l]}
            onClick={() => setLocaleCookieClient(l)}
            className={segment(l === props.current)}
          >
            {CODE[l]}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Language" className={TRACK}>
      {LOCALES.map((l) => (
        <form key={l} action={setAppLocale.bind(null, l)} className="contents">
          <button
            type="submit"
            aria-current={l === props.current ? "true" : undefined}
            aria-label={LABEL[l]}
            title={LABEL[l]}
            className={segment(l === props.current)}
          >
            {CODE[l]}
          </button>
        </form>
      ))}
    </nav>
  );
}
