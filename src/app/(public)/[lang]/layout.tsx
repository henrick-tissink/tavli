import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/locale";
import { RootScaffold } from "@/components/RootScaffold";
import "@/app/globals.css";

export const dynamicParams = false; // only ro/en/de; anything else 404s

// Preserve the original site-wide metadata (incl. the Google Search Console
// verification token) lifted from the deleted top-level app/layout.tsx.
export const metadata: Metadata = {
  title: "Tavli — Găsește-ți masa",
  description: "Descoperă și rezervă restaurante din România",
  verification: {
    google: "qv3pydAGHoDHw7x-3LSbJRM99HuuBxD5HCVpvMROJmE",
  },
};

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
