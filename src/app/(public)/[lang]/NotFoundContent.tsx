"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  isLocale,
  LOCALE_HOME,
  DEFAULT_LOCALE,
  type Locale,
} from "@/lib/i18n/locale";

export interface NotFoundCopy {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

/**
 * `not-found.tsx` is handed no params, but it renders INSIDE `[lang]/layout`,
 * whose RootScaffold already stamped `<html lang>` and rendered the footer in
 * the URL's language. Negotiating a locale from cookie/Accept-Language here
 * produced a German headline over a Romanian footer, so the URL wins instead:
 * `useParams()` reads the same `lang` the layout used. All three copies ship
 * (twelve short strings) because the server component cannot know which.
 */
export function NotFoundContent({ copy }: { copy: Record<Locale, NotFoundCopy> }) {
  const params = useParams();
  const raw = params?.lang;
  const locale: Locale =
    typeof raw === "string" && isLocale(raw) ? raw : DEFAULT_LOCALE;
  const m = copy[locale];

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-6 py-20">
      <div className="max-w-lg text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-primary">
          {m.eyebrow}
        </p>

        {/* The one expressive note on an otherwise quiet page: the same display
            italic the city hero uses, so a dead end still reads as Tavli
            rather than as a server error. */}
        <h1 className="mt-3 text-balance font-display italic text-4xl desktop:text-6xl font-bold leading-[1.05] tracking-tight text-text-primary">
          {m.title}
        </h1>

        <p className="mt-4 text-pretty text-text-secondary leading-relaxed">
          {m.body}
        </p>

        <Link
          href={LOCALE_HOME[locale]}
          className="mt-8 inline-flex items-center justify-center rounded-button bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          {m.cta}
        </Link>
      </div>
    </main>
  );
}
