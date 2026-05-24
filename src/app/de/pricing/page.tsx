import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/PricingPage";
import { loadPricingMessages } from "@/lib/i18n/load-messages";
import { buildPricingMetadata } from "@/lib/pricing/seo";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildPricingMetadata("de", loadPricingMessages("de"));
}

export default function Page() {
  return <PricingPage locale="de" />;
}
