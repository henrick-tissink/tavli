import type { Metadata } from "next";
import CookiesContent from "./cookies-content";

export const metadata: Metadata = {
  title: "Politica de cookie-uri — Tavli",
  description: "Ce cookie-uri folosim pe Tavli și cum le poți gestiona.",
};

export default function Page() {
  return <CookiesContent />;
}
