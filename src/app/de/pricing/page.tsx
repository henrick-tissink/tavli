import { PricingPage } from "@/components/pricing/PricingPage";

export const revalidate = 3600;

export default function Page() {
  return <PricingPage locale="de" />;
}
