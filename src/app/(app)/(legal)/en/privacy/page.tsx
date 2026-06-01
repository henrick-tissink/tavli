import type { Metadata } from "next";
import PrivacyContent from "./privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy — Tavli",
  description: "How we collect, use, and protect your personal data on Tavli.",
};

export default function Page() {
  return <PrivacyContent />;
}
