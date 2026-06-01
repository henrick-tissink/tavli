import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingPage } from "@/components/pricing/PricingPage";
import { loadPricingMessages } from "@/lib/i18n/load-messages";
import { isLocale } from "@/lib/i18n/locale";
import { buildPricingMetadata } from "@/lib/pricing/seo";
import { getSiteUrl } from "@/lib/site-url";
import { buildAlternates } from "@/lib/i18n/hreflang";

// Statically cached, manually revalidated by the BNR refresh job (§15 §3.1).
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : "ro";
  const base = getSiteUrl();
  const meta = buildPricingMetadata(locale, loadPricingMessages(lang));
  return {
    ...meta,
    alternates: buildAlternates("/pricing", locale, base),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <PricingPage locale={lang} />;
}
