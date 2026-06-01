import type { Metadata } from "next";
import ImprintContent from "./imprint-content";

export const metadata: Metadata = {
  title: "Impressum — Tavli",
};

export default function Page() {
  return <ImprintContent />;
}
