import type { Metadata } from "next";
import TermsContent from "./terms-content";

export const metadata: Metadata = {
  title: "Termeni și condiții — Tavli",
  description: "Termenii de utilizare ai platformei Tavli.",
};

export default function Page() {
  return <TermsContent />;
}
