"use client";

import { Home, Map, Search, Heart, User } from "lucide-react";
import type { ReactNode } from "react";

const TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: "discover", label: "Descoperă", icon: <Home size={20} /> },
  { id: "map", label: "Hartă", icon: <Map size={20} /> },
  { id: "search", label: "Caută", icon: <Search size={20} /> },
  { id: "saved", label: "Salvate", icon: <Heart size={20} /> },
  { id: "profile", label: "Profil", icon: <User size={20} /> },
];

interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      aria-label="Navigare principală"
      className="fixed bottom-0 left-0 right-0 bg-surface-white border-t border-border h-16 pb-[env(safe-area-inset-bottom)] desktop:hidden z-50"
    >
      <div className="flex items-center justify-around h-full">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              className={`flex flex-col items-center gap-0.5 text-xs font-medium ${
                isActive ? "text-brand-primary" : "text-text-muted"
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
