import type { Metadata } from "next";
import AnpcContent from "./anpc-content";

export const metadata: Metadata = {
  title: "Verbraucherinformation — ANPC — Tavli",
};

export default function Page() {
  return <AnpcContent />;
}
