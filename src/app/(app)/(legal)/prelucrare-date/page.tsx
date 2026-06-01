import type { Metadata } from "next";
import DataProcessingContent from "./data-processing-content";

export const metadata: Metadata = {
  title: "Acord de prelucrare a datelor — Tavli",
  description:
    "Acordul de prelucrare a datelor (DPA) aplicabil restaurantelor partenere care utilizează Tavli.",
};

export default function Page() {
  return <DataProcessingContent />;
}
