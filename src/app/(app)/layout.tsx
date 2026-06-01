import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  matchLocale,
  type Locale,
} from "@/lib/i18n/locale";
import { RootScaffold } from "@/components/RootScaffold";
import { getSessionLocale } from "@/lib/i18n/session-locale";
import { siteMetadata } from "@/lib/site-metadata";
import "@/app/globals.css";

export { siteMetadata as metadata };

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
