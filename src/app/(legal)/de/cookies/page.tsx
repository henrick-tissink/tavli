import type { Metadata } from "next";
import CookiesContent from "./cookies-content";

export const metadata: Metadata = {
  title: "Cookie-Richtlinie — Tavli",
};

export default function Page() {
  return <CookiesContent />;
}
