import type { Metadata } from "next";
import PrivacyContent from "./privacy-content";

export const metadata: Metadata = {
  title: "Politica de confidențialitate — Tavli",
  description: "Cum colectăm, folosim și protejăm datele tale personale pe Tavli.",
};

export default function Page() {
  return <PrivacyContent />;
}
