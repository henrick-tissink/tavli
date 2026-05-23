import type { Metadata } from "next";
import ImprintContent from "./imprint-content";

export const metadata: Metadata = {
  title: "Legal Notice — Tavli",
  description:
    "Legal information about the operator of the Tavli platform, hosting, and contact details.",
};

export default function Page() {
  return <ImprintContent />;
}
