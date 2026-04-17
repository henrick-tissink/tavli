"use client";

import { use } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = pathname.includes("/map") ? "map" : "discover";
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

      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "discover") router.push(`/${city}`);
          else if (tab === "map") router.push(`/${city}/map`);
          else console.log("Tab:", tab);
        }}
      />
      <MapFab onClick={() => router.push(`/${city}/map`)} />
    </>
  );
}
