import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { RootScaffold } from "@/components/RootScaffold";
import "@/app/globals.css";

export const dynamicParams = false; // only ro/en/de; anything else 404s

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const meta = getMessages(locale, "common").meta;
  return {
    title: meta.title,
    description: meta.description,
    verification: { google: "qv3pydAGHoDHw7x-3LSbJRM99HuuBxD5HCVpvMROJmE" },
  };
}

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
