import { PricingPage } from "@/components/pricing/PricingPage";

// Statically cached, manually revalidated by the BNR refresh job (§15 §3.1).
export const revalidate = 3600;

export default function Page() {
  return <PricingPage locale="ro" />;
}
