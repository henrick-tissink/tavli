"use client";

import Link from "next/link";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { withLocale } from "@/lib/i18n/routing";
import { setAppLocale } from "@/app/(app)/locale-action";
import { setLocaleCookieClient } from "@/lib/i18n/cookie-client";

const LABEL: Record<Locale, string> = { ro: "Română", en: "English", de: "Deutsch" };

type Props =
  | { mode: "path"; current: Locale; pathname: string }
  | { mode: "preference"; current: Locale };

export function LocaleSwitcher(props: Props) {
  if (props.mode === "path") {
    return (
      <nav aria-label="Language">
        {LOCALES.map((l) => (
          <Link
            key={l}
            href={withLocale(props.pathname, l)}
            aria-current={l === props.current ? "true" : undefined}
            onClick={() => setLocaleCookieClient(l)}
          >
            {LABEL[l]}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Language">
      {LOCALES.map((l) => (
        <form key={l} action={setAppLocale.bind(null, l)}>
          <button type="submit" aria-current={l === props.current ? "true" : undefined}>
            {LABEL[l]}
          </button>
        </form>
      ))}
    </nav>
  );
}
