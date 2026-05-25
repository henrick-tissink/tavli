import type { Metadata } from "next";
import DataProcessingContent from "./data-processing-content";

export const metadata: Metadata = {
  title: "Auftragsverarbeitungsvertrag — Tavli",
};

export default function Page() {
  return <DataProcessingContent />;
}
