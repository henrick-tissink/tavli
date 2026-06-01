import type { Metadata } from "next";
import TermsContent from "./terms-content";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen — Tavli",
};

export default function Page() {
  return <TermsContent />;
}
