"use client";

import { use, useState } from "react";
import { LogOut, Bell, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { CitySelector } from "@/components/city-selector";
import { AuthSheet } from "@/components/auth-sheet";

const CITY_DISPLAY_NAMES: Record<string, string> = {
  bucuresti: "București",
  cluj: "Cluj",
  timisoara: "Timișoara",
  brasov: "Brașov",
  iasi: "Iași",
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
  const { auth, signOut } = useAuth();
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const displayCity = formatCityName(city);

  if (auth.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4" />
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-16 h-16 rounded-full bg-surface-bg flex items-center justify-center mb-4">
          <User size={28} className="text-text-muted" />
        </div>
        <h1 className="text-xl font-bold text-text-primary">Profilul tău</h1>
        <p className="text-sm text-text-secondary mt-2 text-center max-w-xs">
          Conectează-te pentru a-ți gestiona contul și preferințele.
        </p>
        <div className="mt-6">
          <Button onClick={() => setAuthSheetOpen(true)}>Conectează-te</Button>
        </div>
        <AuthSheet
          open={authSheetOpen}
          onClose={() => setAuthSheetOpen(false)}
        />
      </div>
    );
  }

  const user = auth.user!;
  const email = user.email ?? "";
  const displayName = email.split("@")[0] || "Utilizator Tavli";
  const memberSince = user.created_at
    ? new Date(user.created_at).toISOString().slice(0, 10)
    : null;

  return (
    <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={displayName} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-primary truncate">
            {displayName}
          </h1>
          {email && (
            <p className="text-sm text-text-secondary truncate">{email}</p>
          )}
          {memberSince && (
            <p className="text-xs text-text-muted mt-0.5">
              Membru din {memberSince}
            </p>
          )}
        </div>
      </div>

      {/* Settings */}
      <section className="space-y-5">
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary">
          Setări
        </h2>

        {/* City */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Oraș</span>
          <CitySelector
            currentCity={displayCity}
            onSelect={(c) => console.log("City selected:", c)}
          />
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">Notificări</span>
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

      {/* Sign Out */}
      <div className="mt-8">
        <Button variant="ghost" fullWidth onClick={() => signOut()}>
          <span className="flex items-center gap-2 justify-center">
            <LogOut size={16} />
            Deconectează-te
          </span>
        </Button>
      </div>

      {/* Version */}
      <p className="text-xs text-text-muted text-center mt-6 mb-8">v1.0.0</p>
    </div>
  );
}
