"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronRight, Bell, Globe, HelpCircle, Shield, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Pill } from "@/components/pill";
import { CitySelector } from "@/components/city-selector";
import { AuthSheet } from "@/components/auth-sheet";

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

export default function ProfilePage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = use(params);
  const router = useRouter();
  const { auth, logout, updateUser } = useAuth();
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState("EN");
  const [notifications, setNotifications] = useState(true);

  const displayCity = formatCityName(city);

  if (!auth.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-16 h-16 rounded-full bg-surface-bg flex items-center justify-center mb-4">
          <span className="text-2xl text-text-muted">?</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary">Your profile</h1>
        <p className="text-sm text-text-secondary mt-2 text-center">
          Sign in to manage your account and preferences.
        </p>
        <div className="mt-6">
          <Button onClick={() => setAuthSheetOpen(true)}>Sign in</Button>
        </div>
        <AuthSheet
          open={authSheetOpen}
          onClose={() => setAuthSheetOpen(false)}
          onAuthenticated={() => {}}
        />
      </div>
    );
  }

  const user = auth.user!;
  const displayName = user.name || "Tavli User";

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={displayName} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-primary truncate">
            {displayName}
          </h1>
          {user.email && (
            <p className="text-sm text-text-secondary truncate">{user.email}</p>
          )}
          <p className="text-sm text-text-secondary">+40 {user.phone}</p>
          <p className="text-xs text-text-muted mt-0.5">
            Member since {user.memberSince}
          </p>
        </div>
      </div>

      {/* Settings */}
      <section className="space-y-5">
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary">
          Settings
        </h2>

        {/* City */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">City</span>
          <CitySelector
            currentCity={displayCity}
            onSelect={(c) => console.log("City selected:", c)}
          />
        </div>

        {/* Language */}
        <div>
          <span className="text-sm font-medium text-text-primary block mb-2">Language</span>
          <div className="flex items-center gap-2">
            {["RO", "TR", "EN"].map((lang) => (
              <Pill
                key={lang}
                label={lang}
                active={selectedLang === lang}
                onToggle={() => setSelectedLang(lang)}
              />
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">Notifications</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notifications}
            onClick={() => setNotifications(!notifications)}
            className={`w-11 h-6 rounded-full relative transition-colors ${
              notifications ? "bg-brand-primary" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                notifications ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Links */}
      <section className="mt-8 space-y-1">
        {[
          { label: "Help & Support", icon: <HelpCircle size={18} /> },
          { label: "Privacy Policy", icon: <Shield size={18} /> },
          { label: "Terms of Service", icon: <FileText size={18} /> },
        ].map((link) => (
          <button
            key={link.label}
            type="button"
            className="w-full flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-surface-bg transition-colors"
          >
            <span className="text-text-muted">{link.icon}</span>
            <span className="text-sm text-text-primary flex-1 text-left">{link.label}</span>
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        ))}
      </section>

      {/* Log Out */}
      <div className="mt-8">
        <Button variant="ghost" fullWidth onClick={handleLogout}>
          <span className="flex items-center gap-2 justify-center">
            <LogOut size={16} />
            Log Out
          </span>
        </Button>
      </div>

      {/* Version */}
      <p className="text-xs text-text-muted text-center mt-6 mb-8">v1.0.0</p>
    </div>
  );
}
