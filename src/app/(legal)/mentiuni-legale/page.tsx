import type { Metadata } from "next";
import ImprintContent from "./imprint-content";

export const metadata: Metadata = {
  title: "Mențiuni legale — Tavli",
  description:
    "Informații legale despre operatorul platformei Tavli, hosting și datele de contact.",
};

export default function Page() {
  return <ImprintContent />;
}
