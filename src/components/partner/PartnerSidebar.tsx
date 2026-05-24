"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  User,
  Clock,
  Image as ImageIcon,
  BookOpen,
  Languages,
  Calendar,
  CalendarCog,
  Star,
  Eye,
  Briefcase,
  DoorOpen,
  CreditCard,
  Building2,
  Send,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { signOutPartner } from "@/app/partner/sign-in/actions";

const NAV = [
  { href: "/partner", label: "Prezentare", icon: LayoutDashboard, exact: true },
  { href: "/partner/profile", label: "Profil", icon: User, exact: false },
  { href: "/partner/hours", label: "Program", icon: Clock, exact: false },
  { href: "/partner/photos", label: "Fotografii", icon: ImageIcon, exact: false },
  { href: "/partner/menu", label: "Meniu", icon: BookOpen, exact: false },
  { href: "/partner/translations", label: "Traduceri", icon: Languages, exact: false },
  { href: "/partner/availability", label: "Disponibilitate", icon: CalendarCog, exact: false },
  { href: "/partner/reservations", label: "Rezervări", icon: Calendar, exact: false },
  { href: "/partner/reviews", label: "Recenzii", icon: Star, exact: false },
  { href: "/partner/corporate", label: "Corporate", icon: Briefcase, exact: true },
  { href: "/partner/corporate/spaces", label: "Spații", icon: DoorOpen, exact: false },
  { href: "/partner/marketing", label: "Marketing", icon: Send, exact: false },
  { href: "/partner/org", label: "Organizație", icon: Building2, exact: false },
  { href: "/partner/billing", label: "Facturare", icon: CreditCard, exact: false },
  { href: "/partner/preview", label: "Previzualizare", icon: Eye, exact: false },
];

interface Props {
  restaurantName: string | null;
  userEmail: string | null;
  openEventRequestsCount?: number;
}

export function PartnerSidebar({
  restaurantName,
  userEmail,
  openEventRequestsCount = 0,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const navContent = (
    <>
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
      <nav className="flex-1 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            const showBadge =
              item.href === "/partner/corporate" && openEventRequestsCount > 0;
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
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span
                      aria-label={`${openEventRequestsCount} cereri deschise`}
                      className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-primary text-white text-[11px] font-semibold leading-none"
                    >
                      {openEventRequestsCount > 99 ? "99+" : openEventRequestsCount}
                    </span>
                  )}
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
            Deconectează-te
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden desktop:flex w-60 shrink-0 h-screen sticky top-0 bg-surface-white border-r border-border flex-col">
        {navContent}
      </aside>

      <header className="desktop:hidden sticky top-0 z-30 flex items-center justify-between bg-surface-white border-b border-border px-4 h-14">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Deschide meniul"
          className="p-2 -ml-2 rounded-lg hover:bg-surface-bg text-text-secondary"
        >
          <Menu size={20} />
        </button>
        <Link
          href="/partner"
          className="font-display text-xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <span className="w-10" aria-hidden />
      </header>

      {open && (
        <div className="desktop:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Închide meniul"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-surface-white border-r border-border flex flex-col animate-slide-in-left">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Închide meniul"
              className="absolute top-3 right-3 p-2 rounded-lg hover:bg-surface-bg text-text-secondary"
            >
              <X size={18} />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
