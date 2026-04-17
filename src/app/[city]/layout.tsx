"use client";

import { use, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { TabBar } from "@/components/tab-bar";
import { MapFab } from "@/components/map-fab";

const CITY_DISPLAY_NAMES: Record<string, string> = {
  bucuresti: "București",
  cluj: "Cluj",
  timisoara: "Timișoara",
  brasov: "Brașov",
  iasi: "Iași",
  istanbul: "Istanbul",
};

function formatCityName(slug: string): string {
  return CITY_DISPLAY_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export default function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city } = use(params);
  const [activeTab, setActiveTab] = useState("discover");
  const displayCity = formatCityName(city);

  return (
    <>
      <TopNav
        currentCity={displayCity}
        onCityChange={(c) => console.log("City changed:", c)}
        onSearchFocus={() => console.log("Search focused")}
        onSavedClick={() => console.log("Saved clicked")}
        onProfileClick={() => console.log("Profile clicked")}
      />

      <main className="pb-20 desktop:pb-0 desktop:pt-16">{children}</main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <MapFab onClick={() => console.log("Map FAB clicked")} />
    </>
  );
}
