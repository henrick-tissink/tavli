import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/locale";
import { RootScaffold } from "@/components/RootScaffold";
import { siteMetadata } from "@/lib/site-metadata";
import "@/app/globals.css";

export const dynamicParams = false; // only ro/en/de; anything else 404s

export { siteMetadata as metadata };

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <RootScaffold lang={lang}>{children}</RootScaffold>;
}
