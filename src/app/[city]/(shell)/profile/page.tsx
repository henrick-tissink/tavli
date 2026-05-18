"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Bell } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
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

const CITY_NAME_TO_SLUG: Record<string, string> = {
  București: "bucuresti",
  Cluj: "cluj",
  Timișoara: "timisoara",
  Brașov: "brasov",
  Iași: "iasi",
};

const NOTIFICATIONS_STORAGE_KEY = "tavli-notifications-enabled";

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
  const { auth, signOut } = useAuth();
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [notifications, setNotifications] = useState(true);

  // Hydrate notification preference from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored !== null) setNotifications(stored === "true");
    } catch {
      // ignore
    }
  }, []);

  const toggleNotifications = () => {
    setNotifications((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleCityChange = (cityName: string) => {
    const slug = CITY_NAME_TO_SLUG[cityName];
    if (!slug || slug === city) return;
    router.push(`/${slug}/profile`);
  };

  const displayCity = formatCityName(city);

  if (auth.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4" />
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
        <EmptyState
          illustration="/illustrations/empty-profile.svg"
          title="Profilul tău"
          body="Conectează-te pentru a-ți gestiona contul, preferințele și istoricul de rezervări."
        />
        <div className="flex justify-center">
          <Button onClick={() => setAuthSheetOpen(true)}>Conectează-te</Button>
        </div>
        <AuthSheet open={authSheetOpen} onClose={() => setAuthSheetOpen(false)} />
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
          <CitySelector currentCity={displayCity} onSelect={handleCityChange} />
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
            aria-label="Notificări"
            onClick={toggleNotifications}
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

      {/* Legal & informare — mobile entry point (desktop has the footer). */}
      <section className="bg-surface-white border border-border rounded-card mb-4 desktop:hidden">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary px-4 pt-4 pb-2">
          Legal & informare
        </h2>
        <ul className="divide-y divide-border">
          {[
            { href: "/confidentialitate", label: "Confidențialitate" },
            { href: "/termeni", label: "Termeni" },
            { href: "/cookie-uri", label: "Cookie-uri" },
            { href: "/anpc", label: "ANPC & SOL" },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-surface-bg"
              >
                <span>{item.label}</span>
                <span aria-hidden className="text-text-muted">›</span>
              </a>
            </li>
          ))}
          <li>
            <a
              href="mailto:hello@tavli.ro"
              className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-surface-bg"
            >
              <span>Contact: hello@tavli.ro</span>
              <span aria-hidden className="text-text-muted">›</span>
            </a>
          </li>
        </ul>
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
