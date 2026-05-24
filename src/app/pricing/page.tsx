import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/PricingPage";
import { loadPricingMessages } from "@/lib/i18n/load-messages";
import { buildPricingMetadata } from "@/lib/pricing/seo";

// Statically cached, manually revalidated by the BNR refresh job (§15 §3.1).
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildPricingMetadata("ro", loadPricingMessages("ro"));
}

export default function Page() {
  return <PricingPage locale="ro" />;
}
