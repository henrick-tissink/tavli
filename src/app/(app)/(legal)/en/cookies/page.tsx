import type { Metadata } from "next";
import CookiesContent from "./cookies-content";

export const metadata: Metadata = {
  title: "Cookie Policy — Tavli",
  description: "Which cookies we use on Tavli and how to manage them.",
};

export default function Page() {
  return <CookiesContent />;
}
