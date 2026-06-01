import type { Metadata } from "next";
import TermsContent from "./terms-content";

export const metadata: Metadata = {
  title: "Terms of Service — Tavli",
  description: "The terms of use of the Tavli platform.",
};

export default function Page() {
  return <TermsContent />;
}
