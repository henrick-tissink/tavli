import type { Metadata } from "next";
import DataProcessingContent from "./data-processing-content";

export const metadata: Metadata = {
  title: "Data Processing Agreement — Tavli",
  description:
    "The data processing agreement (DPA) applicable to partner restaurants using Tavli.",
};

export default function Page() {
  return <DataProcessingContent />;
}
