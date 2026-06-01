import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  matchLocale,
  type Locale,
} from "@/lib/i18n/locale";
import { RootScaffold } from "@/components/RootScaffold";
import { getSessionLocale } from "@/lib/i18n/session-locale";
import "@/app/globals.css";

// Preserve the original site-wide metadata (incl. the Google Search Console
// verification token) lifted from the deleted top-level app/layout.tsx.
export const metadata: Metadata = {
  title: "Tavli — Găsește-ți masa",
  description: "Descoperă și rezervă restaurante din România",
  verification: {
    google: "qv3pydAGHoDHw7x-3LSbJRM99HuuBxD5HCVpvMROJmE",
  },
};

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveAppLocale();
  return <RootScaffold lang={locale}>{children}</RootScaffold>;
}

async function resolveAppLocale(): Promise<Locale> {
  const sessionLocale = await getSessionLocale();
  if (sessionLocale) return sessionLocale;
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  return matchLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}
