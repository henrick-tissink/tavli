"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Clock,
  Image as ImageIcon,
  BookOpen,
  Calendar,
  CalendarCog,
  Eye,
  LogOut,
} from "lucide-react";
import { signOutPartner } from "@/app/partner/sign-in/actions";

const NAV = [
  { href: "/partner", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/partner/profile", label: "Profile", icon: User, exact: false },
  { href: "/partner/hours", label: "Hours", icon: Clock, exact: false },
  { href: "/partner/photos", label: "Photos", icon: ImageIcon, exact: false },
  { href: "/partner/menu", label: "Menu", icon: BookOpen, exact: false },
  { href: "/partner/availability", label: "Availability", icon: CalendarCog, exact: false },
  { href: "/partner/reservations", label: "Reservations", icon: Calendar, exact: false },
  { href: "/partner/preview", label: "Preview", icon: Eye, exact: false },
];

export function PartnerSidebar({
  restaurantName,
  userEmail,
}: {
  restaurantName: string | null;
  userEmail: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-surface-white border-r border-border flex flex-col">
      <div className="px-5 py-6">
        <Link
          href="/partner"
          className="font-display text-2xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          Partner
        </p>
        {restaurantName && (
          <p className="text-sm font-semibold text-text-primary truncate mt-3">
            {restaurantName}
          </p>
        )}
      </div>
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-primary-soft text-brand-primary-dark"
                      : "text-text-secondary hover:bg-surface-bg"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-4 py-4 border-t border-border">
        {userEmail && (
          <p className="text-xs text-text-muted truncate mb-2">{userEmail}</p>
        )}
        <form action={signOutPartner}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-bg transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
