import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { RootScaffold } from "@/components/RootScaffold";
import "@/app/globals.css";

// NOTE: deliberately NOT `dynamicParams = false`. With it, any global cache
// purge (`revalidatePath("/", "layout")`) leaves these prerendered entries with
// nothing to serve, and the whole storefront 404s until the next deploy — this
// is what took demo.tavli.ro's homepage down for nine days. Allowing on-demand
// rendering lets a purged entry regenerate instead. Nothing is lost: the proxy
// prefixes every unprefixed path with a real locale, so only ro/en/de ever
// reach this segment, and the `notFound()` below still rejects anything else.

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
