import type { Metadata } from "next";
import PrivacyContent from "./privacy-content";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Tavli",
};

export default function Page() {
  return <PrivacyContent />;
}
