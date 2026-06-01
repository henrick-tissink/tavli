import type { Metadata } from "next";
import AnpcContent from "./anpc-content";

export const metadata: Metadata = {
  title: "ANPC & SOL — Tavli",
  description: "Informații pentru consumatori și soluționarea alternativă a litigiilor.",
};

export default function Page() {
  return <AnpcContent />;
}
