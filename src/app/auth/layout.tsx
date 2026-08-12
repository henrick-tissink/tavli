import type { Metadata } from "next";
import { RootScaffold } from "@/components/RootScaffold";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import "@/app/globals.css";

/**
 * Root layout for `/auth/*`.
 *
 * There is no `src/app/layout.tsx` — Next allows multiple root layouts under
 * route groups, and `(app)` and `(public)/[lang]` each render <html>/<body>
 * via RootScaffold. The /auth tree sits outside BOTH groups, so until this
 * existed nothing supplied `lang` or a document title, and axe flagged
 * html-has-lang and document-title on /auth/verified and /auth/error.
 *
 * /auth is excluded from locale prefixing in src/proxy.ts, so the locale
 * comes from resolveAppLocale (session → cookie → Accept-Language) exactly as
 * it does for the (app) tree.
 *
 * Route handlers such as /auth/callback are unaffected by layouts.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveAppLocale();
  const meta = getMessages(locale, "common").meta;
  return { title: meta.title, description: meta.description };
}

export default async function AuthRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveAppLocale();
  return <RootScaffold lang={locale}>{children}</RootScaffold>;
}
