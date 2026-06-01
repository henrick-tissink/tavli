import type { Metadata } from "next";
import AnpcContent from "./anpc-content";

export const metadata: Metadata = {
  title: "Consumer Info — ANPC & ODR — Tavli",
  description: "Consumer protection information and alternative dispute resolution.",
};

export default function Page() {
  return <AnpcContent />;
}
